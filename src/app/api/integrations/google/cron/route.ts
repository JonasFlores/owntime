import { NextRequest, NextResponse } from "next/server";
import { syncAllGoogleCalendars } from "@/lib/google-calendar";

async function run(req: NextRequest) {
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await syncAllGoogleCalendars());
}

export const GET = run;
export const POST = run;
