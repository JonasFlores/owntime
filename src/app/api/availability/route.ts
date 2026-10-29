import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase, isConfigured } from "@/lib/supabase";
import { BOOKING_TZ } from "@/lib/tz";

export const dynamic = "force-dynamic";

const schema = z
  .object({ service: z.string().uuid() })
  .and(
    z.union([
      z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
      z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    ]),
  );

export async function GET(req: NextRequest) {
  if (!isConfigured) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const sb = await getSupabase();
  const { service } = parsed.data;

  if ("month" in parsed.data) {
    // whole-month overview: which days have open slots
    const [y, m] = parsed.data.month.split("-").map(Number);
    const p_from = `${parsed.data.month}-01`;
    const p_to = `${parsed.data.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const { data, error } = await sb.rpc("get_available_days", {
      p_service: service,
      p_tz: BOOKING_TZ,
      p_from,
      p_to,
    });
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    const days = ((data ?? []) as { d: string; c: number }[]).map((r) => ({
      date: r.d,
      count: Number(r.c),
    }));
    return NextResponse.json({ days });
  }

  // single date: list of bookable times (business-local "HH:MM")
  const { data, error } = await sb.rpc("get_available_slots", {
    p_service: service,
    p_tz: BOOKING_TZ,
    p_date: parsed.data.date,
  });
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  const slots = ((data ?? []) as { slot_time: string }[]).map((r) => r.slot_time);
  return NextResponse.json({ slots });
}
