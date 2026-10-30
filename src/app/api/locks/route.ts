import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** All time-off locks (with notes) for the admin calendar (session-guarded; RLS as backstop). */
export async function GET() {
  if (!isConfigured) return NextResponse.json({ locks: [] });

  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "unauthorized" }, { status: gate.status });

  const [manual, google] = await Promise.all([
    gate.sb.from("time_off").select("id,starts_at,ends_at,reason,note").order("starts_at"),
    gate.sb.from("google_busy_events").select("id,starts_at,ends_at,all_day").order("starts_at"),
  ]);
  if (manual.error || google.error) return NextResponse.json({ error: manual.error?.message ?? google.error?.message }, { status: 500 });
  return NextResponse.json({
    locks: [
      ...(manual.data ?? []).map((item) => ({ ...item, external: false })),
      ...(google.data ?? []).map((item) => ({
        id: item.id,
        starts_at: item.starts_at,
        ends_at: item.ends_at,
        reason: item.all_day ? "google-calendar-day" : "google-calendar",
        note: null,
        external: true,
      })),
    ],
  });
}
