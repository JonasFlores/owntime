"use server";

import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { BOOKING_TZ } from "@/lib/tz";

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
  email: z.union([z.string().trim().max(120), z.literal("")]),
  note: z.union([z.string().trim().max(500), z.literal("")]),
  ts: z.coerce.number().int(),
});

export async function createAppointment(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  if (!isConfigured) return { ok: false, error: "generic" };

  // honeypot: bots fill it — pretend success and do nothing
  if (String(fd.get("website") ?? "") !== "") return { ok: true };

  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "form" };
  const { service, date, time, name, phone, email, note, ts } = parsed.data;

  // lips on a stick: honour minimum fill time — reject silently otherwise
  if (Date.now() - ts < 2500) return { ok: true };

  const sb = await getSupabase();

  // light rate limiting per phone (raw string as provided)
  const since = new Date(Date.now() - 2 * 3600e3).toISOString();
  const { count } = await sb
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("guest_phone", phone)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) return { ok: false, error: "rate" };

  // Slot is chosen and locked at the DB level via create_appointment():
  // converts business-local date+time to timestamptz, computes end from the
  // service duration, and rejects with {ok:false,error:'taken'} on conflict.
  const { data } = await sb.rpc("create_appointment", {
    p_service: service,
    p_tz: BOOKING_TZ,
    p_date: date,
    p_time: time,
    p_name: name,
    p_phone: phone,
    p_email: email || null,
    p_note: note || null,
  });

  const res = (data ?? null) as { ok: boolean; error?: string } | null;
  if (!res?.ok) {
    return { ok: false, error: res?.error === "taken" || res?.error === "past" || res?.error === "closed" ? "taken" : "generic" };
  }
  return { ok: true };
}
