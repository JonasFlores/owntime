import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Lightweight authenticated count used by the live admin notification badge. */
export async function GET() {
  if (!isConfigured) return NextResponse.json({ count: 0 });

  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "unauthorized" }, { status: gate.status });

  const { count, error } = await gate.sb
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
