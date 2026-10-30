-- Production hardening: public booking integrity, private locks and sync leases.
begin;

alter table public.appointments drop constraint if exists appointments_valid_range;
alter table public.appointments
  add constraint appointments_valid_range check (ends_at > starts_at) not valid;
alter table public.appointments drop constraint if exists appointments_guest_lengths;
alter table public.appointments
  add constraint appointments_guest_lengths check (
    char_length(guest_name) between 2 and 80
    and char_length(guest_phone) between 8 and 16
    and char_length(guest_email) between 3 and 120
    and char_length(coalesce(note, '')) <= 500
  ) not valid;

create table if not exists public.booking_rate_limits (
  id bigint generated always as identity primary key,
  client_hash text not null check (char_length(client_hash) = 64),
  created_at timestamptz not null default now()
);
create index if not exists booking_rate_limits_lookup_idx
  on public.booking_rate_limits (client_hash, created_at desc);
alter table public.booking_rate_limits enable row level security;

alter table public.calendar_sync_jobs add column if not exists processing_started_at timestamptz;
delete from public.calendar_sync_jobs
where id in (
  select id from (
    select id, row_number() over (
      partition by appointment_id, operation order by created_at, id
    ) as duplicate_number
    from public.calendar_sync_jobs where processed_at is null
  ) pending_duplicates
  where duplicate_number > 1
);
create unique index if not exists calendar_sync_jobs_unique_pending_idx
  on public.calendar_sync_jobs (appointment_id, operation) where processed_at is null;

create or replace function public.get_available_slots(
  p_service uuid, p_tz text, p_date date
)
returns table (slot_time text)
language sql stable security definer
set search_path = public
as $$
  with s as (
    select duration_minutes from services where id = p_service and active
  ),
  wh as (
    select start_time, end_time from working_hours
    where open and day_of_week = extract(dow from p_date)::int limit 1
  ),
  slots as (
    select generate_series(
      p_date + wh.start_time,
      p_date + wh.end_time - make_interval(mins => s.duration_minutes),
      interval '30 minutes'
    ) as slot
    from wh, s
    where wh.end_time - wh.start_time >= make_interval(mins => s.duration_minutes)
  )
  select to_char(x.slot, 'HH24:MI')
  from slots x
  where (x.slot at time zone p_tz) > now()
    and not exists (
      select 1 from appointments a where a.status in ('pending','approved')
      and tstzrange(x.slot at time zone p_tz,
        (x.slot + make_interval(mins => (select duration_minutes from s))) at time zone p_tz)
        && tstzrange(a.starts_at, a.ends_at)
    )
    and not exists (
      select 1 from time_off t where tstzrange(x.slot at time zone p_tz,
        (x.slot + make_interval(mins => (select duration_minutes from s))) at time zone p_tz)
        && tstzrange(t.starts_at, t.ends_at)
    )
    and not exists (
      select 1 from google_busy_events g where tstzrange(x.slot at time zone p_tz,
        (x.slot + make_interval(mins => (select duration_minutes from s))) at time zone p_tz)
        && tstzrange(g.starts_at, g.ends_at)
    );
$$;

create or replace function public.get_available_days(
  p_service uuid, p_tz text, p_from date, p_to date
)
returns table (d date, c bigint)
language sql stable security definer
set search_path = public
as $$
  select g.g::date,
    (select count(*) from public.get_available_slots(p_service, p_tz, g.g::date) x)
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(g)
  where p_to >= p_from and p_to - p_from <= 31
    and p_from >= (now() at time zone p_tz)::date - 1
    and p_to <= (now() at time zone p_tz)::date + 366;
$$;

drop function if exists public.create_appointment(uuid, text, date, text, text, text, text, text);
create or replace function public.create_appointment(
  p_service uuid, p_tz text, p_date date, p_time text,
  p_name text, p_phone text, p_email text, p_note text, p_client_hash text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_dur int;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_open_start time;
  v_open_end time;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80
     or p_phone !~ '^\+?[0-9]{8,15}$'
     or p_email is null or char_length(btrim(p_email)) not between 3 and 120
     or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(coalesce(p_note, '')) > 500
     or p_client_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'form');
  end if;
  if p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or p_date < (now() at time zone p_tz)::date
     or p_date > (now() at time zone p_tz)::date + 366 then
    return jsonb_build_object('ok', false, 'error', 'slot');
  end if;

  select duration_minutes into v_dur from services where id = p_service and active;
  if v_dur is null then return jsonb_build_object('ok', false, 'error', 'service'); end if;
  select start_time, end_time into v_open_start, v_open_end from working_hours
  where open and day_of_week = extract(dow from p_date)::int limit 1;
  if v_open_start is null or p_time::time < v_open_start
     or extract(epoch from (p_time::time - v_open_start))::int % 1800 <> 0 then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  v_start := (p_date::text || ' ' || p_time)::timestamp at time zone p_tz;
  v_end := v_start + make_interval(mins => v_dur);
  if v_start <= now() then return jsonb_build_object('ok', false, 'error', 'past'); end if;
  if v_end > ((p_date + v_open_end) at time zone p_tz) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_phone || ':' || p_client_hash));
  delete from booking_rate_limits where created_at < now() - interval '24 hours';
  if (select count(*) from appointments where guest_phone = p_phone and created_at >= now() - interval '2 hours') >= 3
     or (select count(*) from booking_rate_limits where client_hash = p_client_hash and created_at >= now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  insert into booking_rate_limits (client_hash) values (p_client_hash);

  if exists (select 1 from time_off t where tstzrange(v_start, v_end) && tstzrange(t.starts_at, t.ends_at)) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if exists (select 1 from google_busy_events g where tstzrange(v_start, v_end) && tstzrange(g.starts_at, g.ends_at)) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;
  begin
    insert into appointments (service_id, starts_at, ends_at, status, guest_name, guest_phone, guest_email, note)
    values (p_service, v_start, v_end, 'pending', btrim(p_name), p_phone, lower(btrim(p_email)), nullif(btrim(p_note), ''))
    returning id into v_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.create_appointment(uuid, text, date, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_appointment(uuid, text, date, text, text, text, text, text, text) to service_role;

create or replace function public.claim_calendar_sync_jobs(p_limit int default 25)
returns table (id uuid, appointment_id uuid, operation text, attempts int)
language sql security definer set search_path = public
as $$
  with selected as (
    select j.id from calendar_sync_jobs j
    where j.processed_at is null and j.next_attempt_at <= now()
      and (j.processing_started_at is null or j.processing_started_at < now() - interval '10 minutes')
    order by j.created_at for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update calendar_sync_jobs j set processing_started_at = now()
  from selected where j.id = selected.id
  returning j.id, j.appointment_id, j.operation, j.attempts;
$$;
revoke all on function public.claim_calendar_sync_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_calendar_sync_jobs(int) to service_role;

create or replace function public.service_booking_usage()
returns table (service_id uuid, upcoming bigint, pending bigint, history bigint, total bigint)
language sql stable set search_path = public
as $$
  select a.service_id,
    count(*) filter (where a.status in ('pending','approved') and a.starts_at >= now()),
    count(*) filter (where a.status = 'pending'),
    count(*) filter (where a.status not in ('pending','approved') or a.starts_at < now()),
    count(*)
  from appointments a where public.is_admin() group by a.service_id;
$$;
revoke all on function public.service_booking_usage() from public, anon;
grant execute on function public.service_booking_usage() to authenticated;

drop policy if exists "appointments_guest_insert" on public.appointments;
drop policy if exists "timeoff_public_read" on public.time_off;

commit;
