"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { atTz, dayBounds } from "@/lib/tz";
import { normTime, isCoherentWindow } from "@/lib/time";
import { requireAdmin } from "@/lib/admin";
import { sendBookingApproved } from "@/lib/email";

/** Every admin form action resolves to this state (useActionState pattern). */
export type AdminResult = { ok: boolean; code?: string; detail?: string };

const ok = (code: string): AdminResult => ({ ok: true, code });
const fail = (detail?: string): AdminResult => ({ ok: false, detail });

/* ---------- auth ---------- */
/* login stays redirect-based: a full page load is fine there */

export async function signIn(fd: FormData) {
  if (!isConfigured) redirect("/gestao/login?error=denied");
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect("/gestao/login?error=1");
  redirect("/gestao");
}

export async function signOut() {
  if (!isConfigured) redirect("/gestao/login");
  const sb = await getSupabase();
  await sb.auth.signOut();
  redirect("/gestao/login");
}

/* ---------- bookings ---------- */

export async function decide(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb, user } = await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("id"));
  const status = fd.get("status");
  if (!id.success || (status !== "approved" && status !== "rejected")) return fail("bad request");
  const note = String(fd.get("decision_note") || "").slice(0, 300) || null;
  const { data: appointment, error: readError } = await sb
    .from("appointments")
    .select("status,starts_at,ends_at,guest_name,guest_phone,guest_email,note,services(name_pt)")
    .eq("id", id.data)
    .maybeSingle();
  if (readError || !appointment) return fail(readError?.message ?? "Appointment not found");
  const { error } = await sb
    .from("appointments")
    .update({
      status,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      decision_note: status === "approved" ? null : note,
    })
    .eq("id", id.data);
  if (error) return fail(error.message);

  // Send once, only on a real transition into approved. Approval remains
  // successful if Resend is temporarily unavailable.
  if (status === "approved" && appointment.status !== "approved" && appointment.guest_email) {
    const service = appointment.services as unknown as { name_pt?: string } | null;
    await sendBookingApproved({
      guestName: appointment.guest_name,
      guestEmail: appointment.guest_email,
      guestPhone: appointment.guest_phone,
      service: service?.name_pt ?? "Agendamento",
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      note: appointment.note,
    });
  }
  return ok(status);
}

/* ---------- services ---------- */

const serviceSchema = z.object({
  id: z.union([z.string().uuid(), z.literal("")]),
  name_pt: z.string().trim().min(1).max(80),
  name_en: z.string().trim().min(1).max(80),
  duration_minutes: z.coerce.number().int().min(5).max(600),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean(),
});

export async function saveService(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const parsed = serviceSchema.safeParse({
    id: String(fd.get("id") || ""),
    name_pt: String(fd.get("name_pt") || ""),
    name_en: String(fd.get("name_en") || ""),
    duration_minutes: fd.get("duration_minutes"),
    sort_order: fd.get("sort_order") || 0,
    active: fd.get("active") === "on",
  });
  if (!parsed.success) return fail("Invalid service data");
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await sb.from("services").update(row).eq("id", id)
    : await sb.from("services").insert(row);
  return error ? fail(error.message) : ok("saved");
}

/* ---------- weekly working hours ---------- */

export async function saveHours(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const rows: { day_of_week: number; open: boolean; start_time: string; end_time: string }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const open = fd.get(`open-${dow}`) === "on";
    const start = normTime(String(fd.get(`start-${dow}`) || ""));
    const end = normTime(String(fd.get(`end-${dow}`) || ""));
    if (!isCoherentWindow(start, end)) {
      // malformed input on an open day is a real error, not a silent skip
      if (open) return fail("Times must be HH:MM, with closing later than opening");
      rows.push({ day_of_week: dow, open: false, start_time: "09:00", end_time: "18:00" }); // placeholder for closed day
      continue;
    }
    rows.push({ day_of_week: dow, open, start_time: start, end_time: end });
  }
  // upsert (not delete+re-insert): a failure can never wipe the week
  const { error } = await sb.from("working_hours").upsert(rows, { onConflict: "day_of_week" });
  return error ? fail(error.message) : ok("saved");
}

/* ---------- time off: lock days & periods ---------- */

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const nextDayIso = (date: string) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

/** Full-day block toggle. Note text is optional, editable later from the dashboard. */
export async function toggleDayLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  const note = String(fd.get("note") || "").trim().slice(0, 200) || null;
  if (!isDate(date)) return fail("Invalid date");
  const b = dayBounds(date);
  const { data: existing } = await sb
    .from("time_off")
    .select("id")
    .eq("starts_at", b.starts_at)
    .eq("ends_at", b.ends_at)
    .maybeSingle();
  if (existing) {
    const { error } = await sb.from("time_off").delete().eq("id", existing.id);
    return error ? fail(error.message) : ok("unlocked");
  }
  const { error } = await sb.from("time_off").insert({ ...b, reason: "locked-day", note });
  return error ? fail(error.message) : ok("locked");
}

/** Create a partial lock, optionally with an explanatory note. */
export async function saveLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  const start = normTime(String(fd.get("start") || ""));
  const end = normTime(String(fd.get("end") || ""));
  const note = String(fd.get("note") || "").trim().slice(0, 200) || null;
  if (!isDate(date) || !isCoherentWindow(start, end)) return fail("Invalid period");
  const starts_at = atTz(date, start);
  const ends_at = atTz(date, end);
  if (ends_at <= starts_at) return fail("End must be after start");
  const { error } = await sb.from("time_off").insert({ starts_at, ends_at, reason: "locked-period", note });
  return error ? fail(error.message) : ok("saved");
}

/** Rewrite the explanation note on an existing block. */
export async function updateLockNote(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid id");
  const note = String(fd.get("note") || "").trim().slice(0, 200) || null;
  const { error } = await sb.from("time_off").update({ note }).eq("id", id.data);
  return error ? fail(error.message) : ok("saved");
}

export async function removeLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid id");
  const { error } = await sb.from("time_off").delete().eq("id", id.data);
  return error ? fail(error.message) : ok("unlocked");
}

/* ---------- edit an appointment (reschedule / fix details) ---------- */

const apptSchema = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().min(3).max(8),
});

export async function updateAppointment(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const guest_name = String(fd.get("guest_name") || "").trim().slice(0, 80);
  const guest_phone = String(fd.get("guest_phone") || "").trim().slice(0, 20);
  const guest_email = String(fd.get("guest_email") || "").trim().slice(0, 120);
  const note = String(fd.get("note") || "").trim().slice(0, 500);
  const parsed = apptSchema.safeParse({
    id: String(fd.get("id") || ""),
    date: String(fd.get("date") || ""),
    start: String(fd.get("start") || ""),
  });
  if (!parsed.success || guest_name.length < 2 || guest_phone.length < 5 || !guest_email)
    return fail("Name, phone, email, date and time are required");
  if (!/^\S+@\S+\.\S+$/.test(guest_email)) return fail("Invalid email");

  const start = normTime(parsed.data.start);
  if (!start) return fail("Invalid start time");
  let end = normTime(String(fd.get("end") || ""));
  let date = parsed.data.date;
  if (!isCoherentWindow(start, end)) {
    // blank end → fall back to the service duration; crossing midnight rolls the end date
    if (end && end !== "00:00") return fail("End must be after start");
    const { data: appt } = await sb
      .from("appointments")
      .select("id,services(duration_minutes)")
      .eq("id", parsed.data.id)
      .maybeSingle();
    const dur = (appt as { services?: { duration_minutes?: number } | null } | null)?.services?.duration_minutes;
    if (!dur) return fail("End must be after start");
    const [h, m] = start.split(":").map(Number);
    let eMin = h * 60 + m + dur;
    if (eMin >= 1440) {
      date = nextDayIso(date);
      eMin -= 1440;
    }
    end = `${String(Math.floor(eMin / 60)).padStart(2, "0")}:${String(eMin % 60).padStart(2, "0")}`;
  }
  const starts_at = atTz(date, start);
  const ends_at = atTz(date, end);
  const { error } = await sb
    .from("appointments")
    .update({
      starts_at,
      ends_at,
      guest_name,
      guest_phone,
      guest_email,
      note: note || null,
    })
    .eq("id", parsed.data.id);
  if (error) {
    // 23P01: exclusion constraint — this slot overlaps another live appointment
    if ((error as { code?: string }).code === "23P01") return { ok: false, code: "taken", detail: error.message };
    return fail(error.message);
  }
  return ok("updated");
}
