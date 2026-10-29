import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Appointments overlapping [from,to) for the admin dashboard calendar (session-guarded; RLS as backstop). */
export async function GET(req: Request) {
  if (!isConfigured) return NextResponse.json({ appointments: [] });

  const url = new URL(req.url);
  const from = (url.searchParams.get("from") ?? "").trim();
  const to = (url.searchParams.get("to") ?? "").trim();
  const isoStart = /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (!isoStart.test(from) || !isoStart.test(to))
    return NextResponse.json({ error: "bad window" }, { status: 400 });

  const gate = await adminGate();
  if (!gate.ok) return NextResponse.json({ error: "unauthorized" }, { status: gate.status });

  // ends > from AND starts < to  →  every appointment overlapping the window
  const { data, error } = await gate.sb
    .from("appointments")
    .select("id,starts_at,ends_at,status,guest_name,guest_phone,guest_email,note,created_at,services(name_pt,name_en,duration_minutes)")
    .gt("ends_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data ?? [] });
}
