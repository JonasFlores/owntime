"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { atTz, dayBounds } from "@/lib/tz";
import { requireAdmin } from "@/lib/admin";

/* ---------- auth ---------- */

export async function signIn(fd: FormData) {
  if (!isConfigured) redirect("/admin/login?error=denied");
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) redirect(`/admin/login?error=1`);
  redirect("/admin");
}

export async function signOut() {
  if (!isConfigured) redirect("/admin/login");
  const sb = await getSupabase();
  await sb.auth.signOut();
  redirect("/admin/login");
}

/* ---------- bookings ---------- */

const idSchema = z.string().uuid();

export async function decide(fd: FormData) {
  const { sb, user } = await requireAdmin();
  const id = idSchema.safeParse(fd.get("id"));
  const status = fd.get("status");
  if (
    !id.success ||
    (status !== "approved" && status !== "rejected")
  ) {
    return;
  }
  const note = String(fd.get("decision_note") || "").slice(0, 300) || null;
  await sb
    .from("appointments")
    .update({ status, decided_at: new Date().toISOString(), decided_by: user.id, decision_note: status === "approved" ? null : note })
    .eq("id", id.data);
  revalidatePath("/admin");
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
  const fd_active = fd.get("active") === "on";
  const parsed = serviceSchema.safeParse({
    id: String(fd.get("id") || ""),
    name_pt: String(fd.get("name_pt") || ""),
    name_en: String(fd.get("name_en") || ""),
    duration_minutes: fd.get("duration_minutes"),
    sort_order: fd.get("sort_order") ?? 0,
    active: fd_active,
  });
  if (!parsed.success) return;
  const { id, ...row } = parsed.data;
  if (id) {
    await sb.from("services").update(row).eq("id", id);
  } else {
    await sb.from("services").insert(row);
  }
  revalidatePath("/admin/schedule");
}

/* ---------- weekly working hours ---------- */

const hm = /^\d{2}:\d{2}$/;

export async function saveHours(fd: FormData) {
  const { sb } = await requireAdmin();
  const rows = [];
  for (let dow = 0; dow < 7; dow++) {
    const open = fd.get(`open-${dow}`) === "on";
    const start = String(fd.get(`start-${dow}`) || "");
    const end = String(fd.get(`end-${dow}`) || "");
    if (!open || !hm.test(start) || !hm.test(end)) continue;
    if (start >= end) continue;
    rows.push({ day_of_week: dow, start_time: start, end_time: end, open: true });
  }
  // replace the whole weekly template in one go
  await sb.from("working_hours").delete().gte("day_of_week", 0);
  if (rows.length) await sb.from("working_hours").insert(rows);
  revalidatePath("/admin/schedule");
}

/* ---------- time off: lock days & periods ---------- */

export async function toggleDayLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const b = dayBounds(date);
  const { data: existing } = await sb
    .from("time_off")
    .select("id")
    .eq("starts_at", b.starts_at)
    .eq("ends_at", b.ends_at)
    .maybeSingle();
  if (existing) {
    await sb.from("time_off").delete().eq("id", existing.id);
  } else {
    await sb.from("time_off").insert({ ...b, reason: "locked-day" });
  }
  revalidatePath("/admin/schedule");
}

export async function saveLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const date = String(fd.get("date") || "");
  const start = String(fd.get("start") || "");
  const end = String(fd.get("end") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hm.test(start) || !hm.test(end)) return;
  const starts_at = atTz(date, start);
  const ends_at = atTz(date, end);
  if (ends_at <= starts_at) return;
  await sb.from("time_off").insert({ starts_at, ends_at, reason: "locked-period" });
  revalidatePath("/admin/schedule");
}

export async function removeLock(fd: FormData) {
  const { sb } = await requireAdmin();
  const id = idSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  await sb.from("time_off").delete().eq("id", id.data);
  revalidatePath("/admin/schedule");
}
