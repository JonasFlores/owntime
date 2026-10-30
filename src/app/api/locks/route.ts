import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const windowSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/** Locks overlapping the visible admin window (session-guarded; RLS as backstop). */
export async function GET(request: NextRequest) {
  if (!isConfigured) return NextResponse.json({ locks: [] });

  const parsed = windowSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success || parsed.data.from >= parsed.data.to) {
    return NextResponse.json({ error: "bad_window" }, { status: 400 });
  }

  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "unauthorized" }, { status: gate.status });

  const [manual, google] = await Promise.all([
    gate.sb
      .from("time_off")
      .select("id,starts_at,ends_at,reason,note")
      .gt("ends_at", parsed.data.from)
      .lt("starts_at", parsed.data.to)
      .order("starts_at"),
    gate.sb
      .from("google_busy_events")
      .select("id,starts_at,ends_at,all_day")
      .gt("ends_at", parsed.data.from)
      .lt("starts_at", parsed.data.to)
      .order("starts_at"),
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
