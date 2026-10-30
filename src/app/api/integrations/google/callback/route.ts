import { NextRequest, NextResponse } from "next/server";
import { adminGate } from "@/lib/admin";
import {
  encryptGoogleToken,
  ensureOwntimeCalendar,
  exchangeGoogleCode,
  listGoogleCalendars,
  processGoogleSyncJobs,
  syncGoogleConnection,
} from "@/lib/google-calendar";
import { getAdminSupabase } from "@/lib/supabase-admin";

function destination(req: NextRequest, value: string) {
  return new URL(`/gestao/integrations?google=${value}`, req.nextUrl.origin);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("google_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return NextResponse.redirect(destination(req, "invalid_state"));
  const gate = await adminGate();
  if (!gate.ok) return NextResponse.redirect(destination(req, "unauthorized"));
  const { data: auth } = await gate.sb.auth.getUser();
  if (!auth.user) return NextResponse.redirect(destination(req, "unauthorized"));

  try {
    // The redirect_uri must exactly match the one used in the authorize request.
    const tokens = await exchangeGoogleCode(code, req.cookies.get("google_oauth_redirect")?.value);
    const db = getAdminSupabase();
    const now = new Date().toISOString();
    const { data: connection, error } = await db
      .from("google_calendar_connections")
      .upsert(
        {
          singleton: true,
          connected_by: auth.user.id,
          calendar_id: "primary",
          calendar_name: "Google Calendar",
          sync_token: null,
          status: "connected",
          last_error: null,
          channel_id: null,
          channel_resource_id: null,
          channel_expires_at: null,
          updated_at: now,
        },
        { onConflict: "singleton" },
      )
      .select("id")
      .single();
    if (error || !connection) throw error ?? new Error("connection-save-failed");
    await db.from("google_oauth_secrets").upsert(
      {
        connection_id: connection.id,
        refresh_token_encrypted: encryptGoogleToken(tokens.refreshToken),
        updated_at: now,
      },
      { onConflict: "connection_id" },
    );
    await db.from("google_busy_events").delete().eq("connection_id", connection.id);
    const calendars = await listGoogleCalendars(connection.id);
    const primary = calendars.find((item) => item.primary) ?? calendars[0];
    if (!primary) throw new Error("no-writable-google-calendar");
    // Target the dedicated "Owntime" calendar instead of the account's default
    // (primary) calendar, so owntime appointments live in their own profile.
    let target = { id: primary.id, summary: primary.summary ?? primary.id, timeZone: primary.timeZone ?? null };
    try {
      target = await ensureOwntimeCalendar(connection.id);
    } catch (error) {
      console.error("Owntime calendar provisioning failed; falling back to primary", error);
    }
    await db
      .from("google_calendar_connections")
      .update({
        calendar_id: target.id,
        calendar_name: target.summary,
        calendar_timezone: target.timeZone,
        google_account_email: calendars.find((item) => item.primary)?.id ?? null,
      })
      .eq("id", connection.id);
    await syncGoogleConnection(connection.id);
    const { data: approved } = await db.from("appointments").select("id").eq("status", "approved");
    if (approved?.length) {
      await db.from("calendar_sync_jobs").insert(approved.map((item) => ({ appointment_id: item.id, operation: "upsert" })));
      await processGoogleSyncJobs(100);
    }
    const response = NextResponse.redirect(destination(req, "connected"));
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("google_oauth_redirect");
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return NextResponse.redirect(destination(req, "error"));
  }
}
