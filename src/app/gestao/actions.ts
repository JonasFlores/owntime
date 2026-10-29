"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { atTz, dayBounds } from "@/lib/tz";
import { requireAdmin } from "@/lib/admin";

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
  const { error } = await sb
    .from("appointments")
    .update({
      status,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      decision_note: status === "approved" ? null : note,
    })
    .eq("id", id.data);
  return error ? fail(error.message) : ok(status);
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

const hm = /^\d{2}:\d{2}$/;
const normTime = (v: string) => v.slice(0, 5); // Postgres may return "09:00:00"

export async function saveHours(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const rows: { day_of_week: number; open: boolean; start_time: string; end_time: string }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const open = fd.get(`open-${dow}`) === "on";
    const start = normTime(String(fd.get(`start-${dow}`) || ""));
    const end = normTime(String(fd.get(`end-${dow}`) || ""));
    if (!hm.test(start) || !hm.test(end) || start >= end) {
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

export async function toggleDayLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
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
  const { error } = await sb.from("time_off").insert({ ...b, reason: "locked-day" });
  return error ? fail(error.message) : ok("locked");
}

export async function saveLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  const start = normTime(String(fd.get("start") || ""));
  const end = normTime(String(fd.get("end") || ""));
  if (!isDate(date) || !hm.test(start) || !hm.test(end)) return fail("Invalid period");
  const starts_at = atTz(date, start);
  const ends_at = atTz(date, end);
  if (ends_at <= starts_at) return fail("End must be after start");
  const { error } = await sb.from("time_off").insert({ starts_at, ends_at, reason: "locked-period" });
  return error ? fail(error.message) : ok("saved");
}

export async function removeLock(_prev: AdminResult | null, fd: FormData): Promise<AdminResult> {
  const { sb } = await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid id");
  const { error } = await sb.from("time_off").delete().eq("id", id.data);
  return error ? fail(error.message) : ok("unlocked");
}
