import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** All time-off locks (with notes) for the admin calendar (session-guarded; RLS as backstop). */
export async function GET() {
  if (!isConfigured) return NextResponse.json({ locks: [] });

  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "unauthorized" }, { status: gate.status });

  const { data, error } = await gate.sb
    .from("time_off")
    .select("id,starts_at,ends_at,reason,note")
    .order("starts_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locks: data ?? [] });
}
