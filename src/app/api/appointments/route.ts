import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import { submitAppointment } from "@/lib/create-appointment";
import { bodyTooLarge, clientFingerprint } from "@/lib/request-security";
import { z } from "zod";

export const dynamic = "force-dynamic";

const windowSchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});

/** Appointments overlapping [from,to) for the admin dashboard calendar (session-guarded; RLS as backstop). */
export async function GET(req: Request) {
  if (!isConfigured) return NextResponse.json({ appointments: [] });

  const parsed = windowSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success || parsed.data.from >= parsed.data.to)
    return NextResponse.json({ error: "bad window" }, { status: 400 });
  const { from, to } = parsed.data;

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

/** Stable public booking endpoint; unlike a Server Action its URL survives deploys and dev HMR. */
export async function POST(req: Request) {
  if (bodyTooLarge(req)) return NextResponse.json({ ok: false, error: "form" }, { status: 413 });
  try {
    const result = await submitAppointment(await req.formData(), clientFingerprint(req));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[booking] request failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "generic" }, { status: 500 });
  }
}
