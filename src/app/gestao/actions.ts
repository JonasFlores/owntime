"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { atTz, dayBounds } from "@/lib/tz";
import { requireAdmin } from "@/lib/admin";

const HOME = "/gestao";
const SETUP = "/gestao/schedule";

/** Build the setup-page redirect URL carrying the current month + a flash code. */
function setupUrl(fd: FormData, code: string, detail?: string): string {
  const m = String(fd.get("month") || "");
  const base = SETUP + (/^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `?m=${m}` : "");
  return `${base}${base.includes("?") ? "&" : "?"}msg=${code}${detail ? `&d=${encodeURIComponent(detail.slice(0, 140))}` : ""}`;
}

/* ---------- auth ---------- */

export async function signIn(fd: FormData) {
  if (!isConfigured) redirect(`${HOME}/login?error=denied`);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect(`${HOME}/login?error=1`);
  redirect(HOME);
}

export async function signOut() {
  if (!isConfigured) redirect(`${HOME}/login`);
  const sb = await getSupabase();
  await sb.auth.signOut();
  redirect(`${HOME}/login`);
}

/* ---------- bookings ---------- */

const idSchema = z.string().uuid();

export async function decide(fd: FormData) {
  const { sb, user } = await requireAdmin();
  const id = idSchema.safeParse(fd.get("id"));
  const status = fd.get("status");
  if (!id.success || (status !== "approved" && status !== "rejected")) return;
  const note = String(fd.get("decision_note") || "").slice(0, 300) || null;
  const { error } = await sb
    .from("appointments")
    .update({ status, decided_at: new Date().toISOString(), decided_by: user.id, decision_note: status === "approved" ? null : note })
    .eq("id", id.data);
  revalidatePath(HOME);
  redirect(`${HOME}?msg=${error ? "err" : status === "approved" ? "approved" : "declined"}${error ? `&d=${encodeURIComponent((error.message || "").slice(0, 140))}` : ""}`);
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

export async function saveService(fd: FormData) {
  const { sb } = await requireAdmin();
  const parsed = serviceSchema.safeParse({
    id: String(fd.get("id") || ""),
    name_pt: String(fd.get("name_pt") || ""),
    name_en: String(fd.get("name_en") || ""),
    duration_minutes: fd.get("duration_minutes"),
    sort_order: fd.get("sort_order") || 0,
    active: fd.get("active") === "on",
  });
  if (!parsed.success) return redirect(setupUrl(fd, "err", "invalid-service"));
  const { id, ...row } = parsed.data;
  const { error } = id
    ? await sb.from("services").update(row).eq("id", id)
    : await sb.from("services").insert(row);
  revalidatePath(SETUP);
  redirect(setupUrl(fd, error ? "err" : "saved", error?.message));
}

/* ---------- weekly working hours ---------- */

const hm = /^\d{2}:\d{2}$/;
const normTime = (v: string) => v.slice(0, 5); // Postgres may return "09:00:00"

export async function saveHours(fd: FormData) {
  const { sb } = await requireAdmin();
  const rows: { day_of_week: number; open: boolean; start_time: string; end_time: string }[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const open = fd.get(`open-${dow}`) === "on";
    const start = normTime(String(fd.get(`start-${dow}`) || ""));
    const end = normTime(String(fd.get(`end-${dow}`) || ""));
    if (!hm.test(start) || !hm.test(end) || start >= end) {
      // malformed input on an open day is a real error, not a silent skip
      if (open) return redirect(setupUrl(fd, "err", "invalid-hours"));
      rows.push({ day_of_week: dow, open: false, start_time: "09:00", end_time: "18:00" }); // placeholder for closed day
      continue;
    }
    rows.push({ day_of_week: dow, open, start_time: start, end_time: end });
  }
  // upsert (not delete+re-insert): a failure can never wipe the week
  const { error } = await sb.from("working_hours").upsert(rows, { onConflict: "day_of_week" });
  revalidatePath(SETUP);
  redirect(setupUrl(fd, error ? "err" : "saved", error?.message));
}

/* ---------- time off: lock days & periods ---------- */

export async function toggleDayLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return redirect(setupUrl(fd, "err", "bad-date"));
  const b = dayBounds(date);
  const { data: existing } = await sb
    .from("time_off")
    .select("id")
    .eq("starts_at", b.starts_at)
    .eq("ends_at", b.ends_at)
    .maybeSingle();
  if (existing) {
    const { error } = await sb.from("time_off").delete().eq("id", existing.id);
    revalidatePath(SETUP);
    redirect(setupUrl(fd, error ? "err" : "unlocked", error?.message));
  } else {
    const { error } = await sb.from("time_off").insert({ ...b, reason: "locked-day" });
    revalidatePath(SETUP);
    redirect(setupUrl(fd, error ? "err" : "locked", error?.message));
  }
}

export async function saveLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  const start = normTime(String(fd.get("start") || ""));
  const end = normTime(String(fd.get("end") || ""));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hm.test(start) || !hm.test(end)) {
    return redirect(setupUrl(fd, "err", "bad-period"));
  }
  const starts_at = atTz(date, start);
  const ends_at = atTz(date, end);
  if (ends_at <= starts_at) return redirect(setupUrl(fd, "err", "bad-period"));
  const { error } = await sb.from("time_off").insert({ starts_at, ends_at, reason: "locked-period" });
  revalidatePath(SETUP);
  redirect(setupUrl(fd, error ? "err" : "saved", error?.message));
}

export async function removeLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const id = idSchema.safeParse(fd.get("id"));
  if (!id.success) return redirect(setupUrl(fd, "err", "bad-id"));
  const { error } = await sb.from("time_off").delete().eq("id", id.data);
  revalidatePath(SETUP);
  redirect(setupUrl(fd, error ? "err" : "unlocked", error?.message));
}
