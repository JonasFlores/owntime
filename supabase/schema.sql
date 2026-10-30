-- ============================================================
-- Owntime — appointment scheduler · Supabase schema (idempotent)
-- Run once in the Supabase SQL editor. Safe to re-run.
-- After this: sign up your admin via Authentication, then insert
-- their uid into admin_users (step at the bottom).
-- ============================================================

create extension if not exists btree_gist;

-- ---------- tables ----------

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name_pt text not null,
  name_en text not null,
  duration_minutes int not null check (duration_minutes between 5 and 600),
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists public.working_hours (
  day_of_week int primary key check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  open boolean not null default true
);

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text
);

-- free-text explanation of a block ("holiday", "off-site"…), shown in the dashboard
alter table public.time_off add column if not exists note text;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  guest_name text not null,
  guest_phone text not null,
  guest_email text not null,
  note text,
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

-- Google Calendar integration. Public metadata is separated from OAuth secrets
-- so even an authenticated admin cannot accidentally select a refresh token.
create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  connected_by uuid not null references auth.users(id),
  google_account_email text,
  calendar_id text not null,
  calendar_name text,
  calendar_timezone text,
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  status text not null default 'connected'
    check (status in ('connected','syncing','error','revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_secrets (
  connection_id uuid primary key references public.google_calendar_connections(id) on delete cascade,
  refresh_token_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_event_links (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  google_event_id text not null,
  google_etag text,
  last_synced_at timestamptz not null default now(),
  unique (connection_id, appointment_id),
  unique (connection_id, google_event_id)
);

-- Only busy intervals are copied. Event titles, descriptions and attendees are
-- deliberately not persisted in Owntime.
create table if not exists public.google_busy_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  google_event_id text not null,
  recurring_event_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  all_day boolean not null default false,
  google_etag text,
  google_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  unique (connection_id, google_event_id)
);

create index if not exists google_busy_events_range_idx
  on public.google_busy_events using gist (tstzrange(starts_at, ends_at));

create table if not exists public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  operation text not null check (operation in ('upsert','delete')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists calendar_sync_jobs_pending_idx
  on public.calendar_sync_jobs (next_attempt_at) where processed_at is null;

create index if not exists appointments_starts_idx on public.appointments (starts_at);

-- Hard guarantee against double-booking, judged by the database itself:
-- two pending/approved appointments may never overlap.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at) with &&)
  where (status in ('pending','approved'));

-- ---------- admin helper ----------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from admin_users where user_id = auth.uid());
$$;

-- ---------- availability queries (used by the public site) ----------
-- security definer: anon may call them without direct row access.

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
    select start_time, end_time
    from working_hours
    where open and day_of_week = extract(dow from p_date)::int
    limit 1
  ),
  -- anchor slots to p_date so generate_series gets timestamps, not bare times
  slots as (
    select generate_series(
             p_date + wh.start_time,
             p_date + wh.end_time - make_interval(mins => s.duration_minutes),
             interval '30 minutes'
           ) as slot
    from wh, s
    where wh.end_time - wh.start_time > make_interval(mins => s.duration_minutes)
  )
  select to_char(x.slot, 'HH24:MI')
  from slots x
  where (x.slot at time zone p_tz) > now()                       -- not in the past
    and not exists (                                             -- not taken (pending/approved)
      select 1 from appointments a
      where a.status in ('pending','approved')
        and tstzrange(x.slot at time zone p_tz,
                      (x.slot + make_interval(mins => (select duration_minutes from s))) at time zone p_tz)
            && tstzrange(a.starts_at, a.ends_at)
    )
    and not exists (                                             -- not within a time-off lock
      select 1 from time_off t
      where tstzrange(x.slot at time zone p_tz,
                      (x.slot + make_interval(mins => (select duration_minutes from s))) at time zone p_tz)
             && tstzrange(t.starts_at, t.ends_at)
    )
    and not exists (                                             -- not busy in Google Calendar
      select 1 from google_busy_events g
      where tstzrange(x.slot at time zone p_tz,
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
  select g.g::date as d,
         (select count(*) from public.get_available_slots(p_service, p_tz, g.g::date) as x(slot_time)) as c
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(g);
$$;

-- ---------- create appointment (atomic, conflict-safe) ----------

create or replace function public.create_appointment(
  p_service uuid, p_tz text, p_date date, p_time text,
  p_name text, p_phone text,
  p_email text default null, p_note text default null
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
begin
  if p_email is null or btrim(p_email) = '' or position('@' in p_email) <= 1 then
    return jsonb_build_object('ok', false, 'error', 'email');
  end if;

  select duration_minutes into v_dur from services where id = p_service and active;
  if v_dur is null then
    return jsonb_build_object('ok', false, 'error', 'service');
  end if;

  v_start := (p_date::text || ' ' || p_time)::timestamp at time zone p_tz;
  v_end := v_start + make_interval(mins => v_dur);

  if v_start < now() then
    return jsonb_build_object('ok', false, 'error', 'past');
  end if;

  if exists (select 1 from time_off t
             where tstzrange(v_start, v_end - interval '1 second') && tstzrange(t.starts_at, t.ends_at)) then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;

  if exists (select 1 from google_busy_events g
             where tstzrange(v_start, v_end) && tstzrange(g.starts_at, g.ends_at)) then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  begin
    insert into appointments (service_id, starts_at, ends_at, status,
                              guest_name, guest_phone, guest_email, note)
    values (p_service, v_start, v_end, 'pending',
            p_name, p_phone, btrim(p_email), nullif(p_note, ''))
    returning id into v_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.get_available_slots(uuid, text, date) to anon, authenticated;
grant execute on function public.get_available_days(uuid, text, date, date) to anon, authenticated;
grant execute on function public.create_appointment(uuid, text, date, text, text, text, text, text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- row level security ----------

alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.admin_users enable row level security;
alter table public.appointments enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.google_oauth_secrets enable row level security;
alter table public.google_event_links enable row level security;
alter table public.google_busy_events enable row level security;
alter table public.calendar_sync_jobs enable row level security;

-- services: anyone can read active ones; admins manage all
drop policy if exists "services_public_read" on public.services;
create policy "services_public_read" on public.services for select
  using (active or public.is_admin());
drop policy if exists "services_admin_write" on public.services;
create policy "services_admin_write" on public.services for all
  using (public.is_admin()) with check (public.is_admin());

-- working hours: calendar data is public; admins manage
drop policy if exists "hours_public_read" on public.working_hours;
create policy "hours_public_read" on public.working_hours for select using (true);
drop policy if exists "hours_admin_write" on public.working_hours;
create policy "hours_admin_write" on public.working_hours for all
  using (public.is_admin()) with check (public.is_admin());

-- time off: needed to render locked days on the calendar
drop policy if exists "timeoff_public_read" on public.time_off;
create policy "timeoff_public_read" on public.time_off for select using (true);
drop policy if exists "timeoff_admin_write" on public.time_off;
create policy "timeoff_admin_write" on public.time_off for all
  using (public.is_admin()) with check (public.is_admin());

-- admin_users: you can see your own membership; admins see all
drop policy if exists "admins_read" on public.admin_users;
create policy "admins_read" on public.admin_users for select
  using (user_id = auth.uid() or public.is_admin());

-- appointments: guests may only insert pending; only admins may read/edit
drop policy if exists "appointments_guest_insert" on public.appointments;
create policy "appointments_guest_insert" on public.appointments for insert
  with check (status = 'pending');
drop policy if exists "appointments_admin_read" on public.appointments;
create policy "appointments_admin_read" on public.appointments for select
  using (public.is_admin());
drop policy if exists "appointments_admin_update" on public.appointments;
create policy "appointments_admin_update" on public.appointments for update
  using (public.is_admin()) with check (public.is_admin());
-- NOTE: no delete policy on purpose — history is never destroyed.

-- Integration metadata is admin-visible. OAuth secrets intentionally have no
-- policy at all: only the server-side service-role client can access them.
drop policy if exists "google_connections_admin" on public.google_calendar_connections;
create policy "google_connections_admin" on public.google_calendar_connections for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "google_links_admin_read" on public.google_event_links;
create policy "google_links_admin_read" on public.google_event_links for select
  using (public.is_admin());
drop policy if exists "google_busy_admin_read" on public.google_busy_events;
create policy "google_busy_admin_read" on public.google_busy_events for select
  using (public.is_admin());
drop policy if exists "sync_jobs_admin_read" on public.calendar_sync_jobs;
create policy "sync_jobs_admin_read" on public.calendar_sync_jobs for select
  using (public.is_admin());

-- ---------- seed (adapt to your business) ----------

insert into public.services (name_pt, name_en, duration_minutes, sort_order) values
  ('Consulta', 'Consultation', 60, 0),
  ('Sessão curta', 'Short session', 30, 1)
on conflict do nothing;

insert into public.working_hours (day_of_week, start_time, end_time, open) values
  (0, '09:00', '18:00', false), -- Sunday: closed (keep the row, open=false)
  (1, '09:00', '18:00', true),
  (2, '09:00', '18:00', true),
  (3, '09:00', '18:00', true),
  (4, '09:00', '18:00', true),
  (5, '09:00', '18:00', true),
  (6, '09:00', '13:00', true)   -- Saturday morning
on conflict (day_of_week) do nothing;

-- ---------- finally: register your admins ----------
-- Get the UUID from Authentication → Users after they sign up, then:
-- insert into public.admin_users (user_id, email)
--   values ('<uid-from-auth.users>', 'admin@yourstudio.com');
