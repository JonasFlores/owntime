import { z } from "zod";
import { isConfigured } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { atTz, BOOKING_TZ } from "@/lib/tz";
import { sendAdminBookingAlert } from "@/lib/email";
import { isIsoDate, normalizePhone } from "@/lib/validation";
import { isValidHM } from "@/lib/time";

export interface SubmitState {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  service: z.string().uuid(),
  date: z.string().refine(isIsoDate),
  time: z.string().refine(isValidHM),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[\d\s()+-]{8,20}$/),
  email: z.string().trim().email().max(120),
  note: z.union([z.string().trim().max(500), z.literal("")]),
  ts: z.coerce.number().int(),
});

export async function submitAppointment(fd: FormData, clientHash: string): Promise<SubmitState> {
  if (!isConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, error: "generic" };

  // Honeypot: bots fill it — pretend success and do nothing.
  if (String(fd.get("website") ?? "") !== "") return { ok: true };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "form" };
  const { service, date, time, name, email, note, ts } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  if (!/^\+?\d{8,15}$/.test(phone)) return { ok: false, error: "form" };

  // Honour a minimum form-fill time; reject bots silently.
  if (Date.now() - ts < 2500) return { ok: true };

  const sb = getAdminSupabase();
  const { data, error } = await sb.rpc("create_appointment", {
    p_service: service,
    p_tz: BOOKING_TZ,
    p_date: date,
    p_time: time,
    p_name: name,
    p_phone: phone,
    p_email: email.toLowerCase(),
    p_note: note || null,
    p_client_hash: clientHash,
  });

  if (error) {
    console.error("[booking] create_appointment failed", error);
    return { ok: false, error: "generic" };
  }

  const res = (data ?? null) as { ok: boolean; error?: string; id?: string } | null;
  if (!res?.ok) {
    const unavailable = ["taken", "past", "closed", "slot"].includes(res?.error ?? "");
    return { ok: false, error: res?.error === "rate" ? "rate" : unavailable ? "taken" : "generic" };
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
