import { NextRequest, NextResponse } from "next/server";
import { processGoogleSyncJobs, syncGoogleConnection } from "@/lib/google-calendar";
import { getAdminSupabase } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceId = req.headers.get("x-goog-resource-id");
  const token = req.headers.get("x-goog-channel-token");
  if (!channelId || !resourceId || !process.env.GOOGLE_WEBHOOK_SECRET || token !== process.env.GOOGLE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getAdminSupabase();
  const { data: connection } = await db
    .from("google_calendar_connections")
    .select("id")
    .eq("channel_id", channelId)
    .eq("channel_resource_id", resourceId)
    .maybeSingle();
  if (!connection) return NextResponse.json({ error: "unknown_channel" }, { status: 404 });
  await syncGoogleConnection(connection.id).catch((error) => console.error("Google webhook sync failed", error));
  await processGoogleSyncJobs().catch((error) => console.error("Google webhook jobs failed", error));
  return new NextResponse(null, { status: 204 });
}
