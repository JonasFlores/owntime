import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { atTz, BOOKING_TZ } from "@/lib/tz";
import { sendAdminBookingAlert } from "@/lib/email";

export interface SubmitState {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  service: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[\d\s()+-]{8,20}$/),
  email: z.string().trim().email().max(120),
  note: z.union([z.string().trim().max(500), z.literal("")]),
  ts: z.coerce.number().int(),
});

export async function submitAppointment(fd: FormData): Promise<SubmitState> {
  if (!isConfigured) return { ok: false, error: "generic" };

  // Honeypot: bots fill it — pretend success and do nothing.
  if (String(fd.get("website") ?? "") !== "") return { ok: true };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "form" };
  const { service, date, time, name, phone, email, note, ts } = parsed.data;

  // Honour a minimum form-fill time; reject bots silently.
  if (Date.now() - ts < 2500) return { ok: true };

  const sb = await getSupabase();
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { count } = await sb
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("guest_phone", phone)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) return { ok: false, error: "rate" };

  const { data } = await sb.rpc("create_appointment", {
    p_service: service,
    p_tz: BOOKING_TZ,
    p_date: date,
    p_time: time,
    p_name: name,
    p_phone: phone,
    p_email: email,
    p_note: note || null,
  });

  const res = (data ?? null) as { ok: boolean; error?: string; id?: string } | null;
  if (!res?.ok) {
    const unavailable = res?.error === "taken" || res?.error === "past" || res?.error === "closed";
    return { ok: false, error: unavailable ? "taken" : "generic" };
  }
  // The reservation is already durable. Notification failure is logged by the
  // mail helper but never turns a successful booking into an error response.
  const { data: svc } = await sb
    .from("services")
    .select("name_pt,duration_minutes")
    .eq("id", service)
    .maybeSingle();
  const startsAt = atTz(date, time);
  const endsAt = new Date(new Date(startsAt).getTime() + Number(svc?.duration_minutes ?? 0) * 60000).toISOString();
  await sendAdminBookingAlert({
    guestName: name,
    guestEmail: email,
    guestPhone: phone,
    service: svc?.name_pt ?? "Agendamento",
    startsAt,
    endsAt,
    note: note || null,
  });
  return { ok: true };
}
