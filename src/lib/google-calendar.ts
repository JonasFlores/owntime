import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { atTz, BOOKING_TZ } from "@/lib/tz";
import { getAdminSupabase } from "@/lib/supabase-admin";

const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALLBACK_PATH = "/api/integrations/google/callback";
const GOOGLE_TIMEOUT_MS = 15_000;

const withTimeout = (signal?: AbortSignal | null) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(GOOGLE_TIMEOUT_MS)])
    : AbortSignal.timeout(GOOGLE_TIMEOUT_MS);

/**
 * Redirect URIs registered in the Google Cloud console. Accepts a single
 * `GOOGLE_OAUTH_REDIRECT_URI` and/or a comma-separated
 * `GOOGLE_OAUTH_REDIRECT_URIS` list (e.g. localhost, tunnel and production).
 */
export function googleRedirectUris() {
  return [process.env.GOOGLE_OAUTH_REDIRECT_URIS, process.env.GOOGLE_OAUTH_REDIRECT_URI]
    .filter((value): value is string => Boolean(value))
    .join(",")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => {
      try {
        return new URL(value).pathname === GOOGLE_CALLBACK_PATH;
      } catch {
        return false;
      }
    })
    .filter((value, index, list) => list.indexOf(value) === index);
}

/**
 * Pick the redirect URI for this request. The exact origin wins; otherwise a
 * configured URI with the same host is reused so scheme differences (for
 * example an `https://localhost` request while only `http://localhost` is
 * registered) do not trigger Google's `redirect_uri_mismatch`.
 */
export function resolveGoogleRedirectUri(origin: string) {
  const derived = new URL(GOOGLE_CALLBACK_PATH, origin).toString();
  const configured = googleRedirectUris();
  if (configured.includes(derived)) return derived;
  const { host } = new URL(derived);
  const sameHost = configured.find((uri) => new URL(uri).host === host);
  return sameHost ?? derived;
}

export const googleConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    googleRedirectUris().length &&
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export interface GoogleConnection {
  id: string;
  calendar_id: string;
  calendar_name: string | null;
  calendar_timezone: string | null;
  google_account_email: string | null;
  sync_token: string | null;
  channel_id: string | null;
  channel_resource_id: string | null;
  channel_expires_at: string | null;
  status: "connected" | "syncing" | "error" | "revoked";
  last_synced_at: string | null;
  last_error: string | null;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  etag?: string;
  updated?: string;
  transparency?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function encryptionKey() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("google-token-encryption-key-not-configured");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptGoogleToken(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptGoogleToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("invalid-encrypted-google-token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = googleRedirectUris()[0];
  if (!clientId || !clientSecret || !redirectUri) throw new Error("google-oauth-not-configured");
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthorizationUrl(state: string, redirectUri: string) {
  const { clientId } = oauthConfig();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    // auth/calendar allows provisioning the dedicated "Owntime" calendar itself
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ].join(" "),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

export async function exchangeGoogleCode(code: string, redirectUri?: string) {
  const { clientId, clientSecret, redirectUri: configuredUri } = oauthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri ?? configuredUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const body = (await response.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new GoogleApiError(body.error ?? "google-token-exchange-failed", response.status);
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

async function accessToken(connectionId: string, db = getAdminSupabase()) {
  const { data: secret, error } = await db
    .from("google_oauth_secrets")
    .select("refresh_token_encrypted")
    .eq("connection_id", connectionId)
    .single();
  if (error || !secret) throw new Error("google-refresh-token-not-found");
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptGoogleToken(secret.refresh_token_encrypted),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      await db.from("google_calendar_connections").update({ status: "revoked", last_error: body.error }).eq("id", connectionId);
    }
    throw new GoogleApiError(body.error ?? "google-token-refresh-failed", response.status);
  }
  return body.access_token;
}

async function googleRequest<T>(connectionId: string, path: string, init: RequestInit = {}, db = getAdminSupabase()) {
  const token = await accessToken(connectionId, db);
  const response = await fetch(`${GOOGLE_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: withTimeout(init.signal),
  });
  if (response.status === 204) return null as T;
  const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!response.ok) throw new GoogleApiError(body.error?.message ?? `Google API ${response.status}`, response.status);
  return body;
}

export async function listGoogleCalendars(connectionId: string) {
  const result = await googleRequest<{
    items?: Array<{
      id: string;
      summary?: string;
      primary?: boolean;
      accessRole?: string;
      timeZone?: string;
      extendedProperties?: { private?: Record<string, string> };
    }>;
  }>(connectionId, "/users/me/calendarList?minAccessRole=writer&showHidden=false");
  return (result.items ?? []).filter((item) => item.id && (item.accessRole === "owner" || item.accessRole === "writer"));
}

const OWNTIME_CALENDAR_NAME = "Owntime";

/**
 * Find or create the dedicated Gmail-side calendar used for owntime appointments,
 * so they never mix with the Google account's default (primary) calendar.
 */
export async function ensureOwntimeCalendar(connectionId: string) {
  const calendars = await listGoogleCalendars(connectionId);
  const existing = calendars.find((item) => item.extendedProperties?.private?.owntime === "true");
  if (existing) return { id: existing.id, summary: existing.summary ?? OWNTIME_CALENDAR_NAME, timeZone: existing.timeZone ?? null };
  const created = await googleRequest<{ id: string; summary?: string; timeZone?: string }>(
    connectionId,
    "/calendars",
    {
      method: "POST",
      body: JSON.stringify({
        summary: OWNTIME_CALENDAR_NAME,
        timeZone: BOOKING_TZ,
        extendedProperties: { private: { owntime: "true" } },
      }),
    },
  );
  return { id: created.id, summary: created.summary ?? OWNTIME_CALENDAR_NAME, timeZone: created.timeZone ?? BOOKING_TZ };
}

function nextDate(date: string) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
}

function eventRange(event: GoogleEvent) {
  if (event.start?.dateTime && event.end?.dateTime) {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    if (Number.isFinite(start.getTime()) && end > start) return { starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: false };
  }
  if (event.start?.date && event.end?.date) {
    return { starts_at: atTz(event.start.date, "00:00"), ends_at: atTz(event.end.date, "00:00"), all_day: true };
  }
  if (event.start?.date) {
    return { starts_at: atTz(event.start.date, "00:00"), ends_at: atTz(nextDate(event.start.date), "00:00"), all_day: true };
  }
  return null;
}

async function registerWatch(connection: GoogleConnection, db: SupabaseClient) {
  const address = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  const token = process.env.GOOGLE_WEBHOOK_SECRET;
  if (!address || !token || !address.startsWith("https://")) return;
  const expires = connection.channel_expires_at ? new Date(connection.channel_expires_at).getTime() : 0;
  if (connection.channel_id && expires > Date.now() + 24 * 3600_000) return;

  if (connection.channel_id && connection.channel_resource_id) {
    await googleRequest(connection.id, "/channels/stop", {
      method: "POST",
      body: JSON.stringify({ id: connection.channel_id, resourceId: connection.channel_resource_id }),
    }, db).catch(() => null);
  }

  const channelId = crypto.randomUUID();
  const expiration = Date.now() + 6 * 24 * 3600_000;
  const watch = await googleRequest<{ id: string; resourceId: string; expiration?: string }>(
    connection.id,
    `/calendars/${encodeURIComponent(connection.calendar_id)}/events/watch`,
    { method: "POST", body: JSON.stringify({ id: channelId, type: "web_hook", address, token, expiration }) },
    db,
  );
  await db
    .from("google_calendar_connections")
    .update({
      channel_id: watch.id,
      channel_resource_id: watch.resourceId,
      channel_expires_at: new Date(Number(watch.expiration ?? expiration)).toISOString(),
    })
    .eq("id", connection.id);
}

export async function syncGoogleConnection(connectionId: string, retryFull = true) {
  const db = getAdminSupabase();
  const { data, error } = await db.from("google_calendar_connections").select("*").eq("id", connectionId).single();
  if (error || !data) throw new Error("google-connection-not-found");
  const connection = data as GoogleConnection;
  await db.from("google_calendar_connections").update({ status: "syncing", last_error: null }).eq("id", connectionId);

  try {
    const fullSync = !connection.sync_token;
    // Keep the previous snapshot available until a complete full sync succeeds.
    const syncStartedAt = new Date().toISOString();
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500" });
      if (connection.sync_token) params.set("syncToken", connection.sync_token);
      else params.set("timeMin", new Date(Date.now() - 30 * 86400_000).toISOString());
      if (pageToken) params.set("pageToken", pageToken);
      const result = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
        connectionId,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params}`,
        {},
        db,
      );
      for (const event of result.items ?? []) {
        if (!event.id) continue;
        const ownAppointmentId = event.extendedProperties?.private?.owntimeAppointmentId;
        const own = Boolean(ownAppointmentId);
        const range = eventRange(event);
        if (event.status === "cancelled" || event.transparency === "transparent" || own || !range) {
          await db.from("google_busy_events").delete().eq("connection_id", connectionId).eq("google_event_id", event.id);
          if (ownAppointmentId && /^[0-9a-f-]{36}$/i.test(ownAppointmentId) && event.status !== "cancelled") {
            await db.from("google_event_links").upsert(
              {
                connection_id: connectionId,
                appointment_id: ownAppointmentId,
                google_event_id: event.id,
                google_etag: event.etag ?? null,
                last_synced_at: new Date().toISOString(),
              },
              { onConflict: "connection_id,appointment_id" },
            );
            const { data: appointment } = await db
              .from("appointments")
              .select("starts_at,ends_at,status")
              .eq("id", ownAppointmentId)
              .maybeSingle();
            if (appointment && appointment.status !== "approved") {
              await db.from("calendar_sync_jobs").insert({ appointment_id: ownAppointmentId, operation: "delete" });
            } else if (
              appointment?.status === "approved" &&
              range &&
              (new Date(appointment.starts_at).getTime() !== new Date(range.starts_at).getTime() ||
                new Date(appointment.ends_at).getTime() !== new Date(range.ends_at).getTime())
            ) {
              await db.from("calendar_sync_jobs").insert({ appointment_id: ownAppointmentId, operation: "upsert" });
            }
          } else if (ownAppointmentId && /^[0-9a-f-]{36}$/i.test(ownAppointmentId) && event.status === "cancelled") {
            await db.from("calendar_sync_jobs").insert({ appointment_id: ownAppointmentId, operation: "upsert" });
          } else if (event.status === "cancelled") {
            const { data: link } = await db
              .from("google_event_links")
              .select("appointment_id")
              .eq("connection_id", connectionId)
              .eq("google_event_id", event.id)
              .maybeSingle();
            if (link) await db.from("calendar_sync_jobs").insert({ appointment_id: link.appointment_id, operation: "upsert" });
          }
          continue;
        }
        await db.from("google_busy_events").upsert(
          {
            connection_id: connectionId,
            google_event_id: event.id,
            recurring_event_id: event.recurringEventId ?? null,
            ...range,
            google_etag: event.etag ?? null,
            google_updated_at: event.updated ?? null,
            last_seen_at: syncStartedAt,
          },
          { onConflict: "connection_id,google_event_id" },
        );
      }
      pageToken = result.nextPageToken;
      nextSyncToken = result.nextSyncToken ?? nextSyncToken;
    } while (pageToken);

    if (fullSync) {
      const { error: cleanupError } = await db
        .from("google_busy_events")
        .delete()
        .eq("connection_id", connectionId)
        .lt("last_seen_at", syncStartedAt);
      if (cleanupError) throw cleanupError;
    }

    const now = new Date().toISOString();
    await db
      .from("google_calendar_connections")
      .update({ sync_token: nextSyncToken, status: "connected", last_synced_at: now, last_error: null, updated_at: now })
      .eq("id", connectionId);
    await registerWatch({ ...connection, sync_token: nextSyncToken ?? null }, db);
    return { ok: true };
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 410 && retryFull) {
      await db.from("google_calendar_connections").update({ sync_token: null }).eq("id", connectionId);
      return syncGoogleConnection(connectionId, false);
    }
    const message = error instanceof Error ? error.message.slice(0, 500) : "sync-failed";
    await db.from("google_calendar_connections").update({ status: "error", last_error: message }).eq("id", connectionId);
    throw error;
  }
}

export async function enqueueAppointmentSync(appointmentId: string, operation: "upsert" | "delete") {
  if (!googleConfigured) return;
  const db = getAdminSupabase();
  const { count } = await db.from("google_calendar_connections").select("id", { count: "exact", head: true });
  if (!count) return;
  await db.from("calendar_sync_jobs").insert({ appointment_id: appointmentId, operation });
  await processGoogleSyncJobs(5).catch((error) => console.error("Google Calendar sync job failed", error));
}

async function deleteLinkedEvent(db: SupabaseClient, connection: GoogleConnection, appointmentId: string) {
  const { data: link } = await db
    .from("google_event_links")
    .select("google_event_id")
    .eq("connection_id", connection.id)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (!link) return;
  await googleRequest(
    connection.id,
    `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`,
    { method: "DELETE" },
    db,
  ).catch((error) => {
    if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
  });
  await db.from("google_event_links").delete().eq("connection_id", connection.id).eq("appointment_id", appointmentId);
}

async function syncAppointment(db: SupabaseClient, connection: GoogleConnection, appointmentId: string, operation: string) {
  if (operation === "delete") return deleteLinkedEvent(db, connection, appointmentId);
  const { data: appointment } = await db
    .from("appointments")
    .select("id,status,starts_at,ends_at,guest_name,guest_phone,guest_email,note,services(name_pt)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appointment || appointment.status !== "approved") return deleteLinkedEvent(db, connection, appointmentId);

  const service = appointment.services as unknown as { name_pt?: string } | null;
  const body = {
    summary: `${service?.name_pt ?? "Agendamento"} — ${appointment.guest_name}`,
    description: [
      `Telefone: ${appointment.guest_phone}`,
      `E-mail: ${appointment.guest_email}`,
      appointment.note ? `Observações: ${appointment.note}` : null,
      `Owntime ID: ${appointment.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: { dateTime: appointment.starts_at, timeZone: BOOKING_TZ },
    end: { dateTime: appointment.ends_at, timeZone: BOOKING_TZ },
    extendedProperties: { private: { owntimeAppointmentId: appointment.id } },
  };
  const { data: link } = await db
    .from("google_event_links")
    .select("google_event_id")
    .eq("connection_id", connection.id)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  let event: { id: string; etag?: string };
  if (link) {
    try {
      event = await googleRequest(
        connection.id,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(link.google_event_id)}?sendUpdates=none`,
        { method: "PATCH", body: JSON.stringify(body) },
        db,
      );
    } catch (error) {
      if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
      event = await googleRequest(
        connection.id,
        `/calendars/${encodeURIComponent(connection.calendar_id)}/events?sendUpdates=none`,
        { method: "POST", body: JSON.stringify(body) },
        db,
      );
    }
  } else {
    event = await googleRequest(
      connection.id,
      `/calendars/${encodeURIComponent(connection.calendar_id)}/events?sendUpdates=none`,
      { method: "POST", body: JSON.stringify(body) },
      db,
    );
  }
  await db.from("google_event_links").upsert(
    {
      connection_id: connection.id,
      appointment_id: appointmentId,
      google_event_id: event.id,
      google_etag: event.etag ?? null,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "connection_id,appointment_id" },
  );
}

export async function processGoogleSyncJobs(limit = 25) {
  if (!googleConfigured) return { processed: 0 };
  const db = getAdminSupabase();
  const { data: connectionRow } = await db.from("google_calendar_connections").select("*").limit(1).maybeSingle();
  if (!connectionRow) return { processed: 0 };
  const connection = connectionRow as GoogleConnection;
  const { data: jobs, error: claimError } = await db.rpc("claim_calendar_sync_jobs", { p_limit: limit });
  if (claimError) throw claimError;
  let processed = 0;
  for (const job of jobs ?? []) {
    try {
      await syncAppointment(db, connection, job.appointment_id, job.operation);
      await db
        .from("calendar_sync_jobs")
        .update({ processed_at: new Date().toISOString(), processing_started_at: null, last_error: null })
        .eq("id", job.id);
      processed++;
    } catch (error) {
      const attempts = Number(job.attempts) + 1;
      const delayMinutes = Math.min(2 ** attempts, 360);
      await db
        .from("calendar_sync_jobs")
        .update({
          attempts,
          processing_started_at: null,
          last_error: error instanceof Error ? error.message.slice(0, 500) : "sync-failed",
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { processed };
}

export async function syncAllGoogleCalendars() {
  if (!googleConfigured) return { connections: 0, jobs: 0 };
  const db = getAdminSupabase();
  const { data } = await db.from("google_calendar_connections").select("id");
  for (const connection of data ?? []) await syncGoogleConnection(connection.id).catch(() => null);
  const jobs = await processGoogleSyncJobs();
  return { connections: data?.length ?? 0, jobs: jobs.processed };
}

export async function switchGoogleCalendar(
  connectionId: string,
  calendar: { id: string; summary?: string; timeZone?: string },
) {
  const db = getAdminSupabase();
  const { data } = await db.from("google_calendar_connections").select("*").eq("id", connectionId).single();
  if (!data) throw new Error("google-connection-not-found");
  const connection = data as GoogleConnection;
  if (connection.calendar_id === calendar.id) return syncGoogleConnection(connectionId);

  const { data: links } = await db
    .from("google_event_links")
    .select("appointment_id")
    .eq("connection_id", connectionId);
  for (const link of links ?? []) await deleteLinkedEvent(db, connection, link.appointment_id).catch(() => null);
  if (connection.channel_id && connection.channel_resource_id) {
    await googleRequest(connectionId, "/channels/stop", {
      method: "POST",
      body: JSON.stringify({ id: connection.channel_id, resourceId: connection.channel_resource_id }),
    }, db).catch(() => null);
  }
  await db.from("google_busy_events").delete().eq("connection_id", connectionId);
  await db
    .from("google_calendar_connections")
    .update({
      calendar_id: calendar.id,
      calendar_name: calendar.summary ?? calendar.id,
      calendar_timezone: calendar.timeZone ?? null,
      sync_token: null,
      channel_id: null,
      channel_resource_id: null,
      channel_expires_at: null,
      last_synced_at: null,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  const { data: approved } = await db.from("appointments").select("id").eq("status", "approved");
  if (approved?.length) {
    await db.from("calendar_sync_jobs").insert(approved.map((item) => ({ appointment_id: item.id, operation: "upsert" })));
  }
  await syncGoogleConnection(connectionId);
  await processGoogleSyncJobs(100);
}

export async function disconnectGoogleCalendar(connectionId: string) {
  const db = getAdminSupabase();
  const { data } = await db.from("google_calendar_connections").select("*").eq("id", connectionId).single();
  if (!data) return;
  const connection = data as GoogleConnection;
  if (connection.channel_id && connection.channel_resource_id) {
    await googleRequest(connectionId, "/channels/stop", {
      method: "POST",
      body: JSON.stringify({ id: connection.channel_id, resourceId: connection.channel_resource_id }),
    }, db).catch(() => null);
  }
  await db.from("google_calendar_connections").delete().eq("id", connectionId);
}
