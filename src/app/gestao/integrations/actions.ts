"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import {
  disconnectGoogleCalendar,
  listGoogleCalendars,
  switchGoogleCalendar,
  syncGoogleConnection,
} from "@/lib/google-calendar";

export async function syncGoogleNow(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("connection_id"));
  if (!id.success) redirect("/gestao/integrations?google=bad_request");
  let ok = false;
  try {
    await syncGoogleConnection(id.data);
    revalidatePath("/gestao/integrations");
    ok = true;
  } catch {}
  redirect(`/gestao/integrations?google=${ok ? "synced" : "sync_error"}`);
}

export async function selectGoogleCalendar(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("connection_id"));
  const calendarId = String(fd.get("calendar_id") ?? "");
  if (!id.success || !calendarId) redirect("/gestao/integrations?google=bad_request");
  let result = "sync_error";
  try {
    const calendars = await listGoogleCalendars(id.data);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (selected) {
      await switchGoogleCalendar(id.data, selected);
      revalidatePath("/gestao/integrations");
      result = "calendar_changed";
    } else result = "calendar_denied";
  } catch {}
  redirect(`/gestao/integrations?google=${result}`);
}

export async function disconnectGoogle(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().safeParse(fd.get("connection_id"));
  if (!id.success) redirect("/gestao/integrations?google=bad_request");
  await disconnectGoogleCalendar(id.data);
  revalidatePath("/gestao/integrations");
  redirect("/gestao/integrations?google=disconnected");
}
