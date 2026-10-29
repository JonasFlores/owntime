import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * Guard for admin pages: must be signed in AND present in admin_users.
 * RLS denies everything else, so non-admins get an empty DB as well.
 */
export async function requireAdmin(): Promise<{ sb: SupabaseClient; user: User }> {
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/gestao/login");
  const { data: row } = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!row) redirect("/gestao/login?error=denied");
  return { sb, user };
}

/**
 * Guard for admin JSON endpoints (fetch-based clients): same checks as
 * requireAdmin but returning HTTP statuses instead of redirecting.
 */
export async function adminGate(): Promise<{ ok: true; sb: SupabaseClient } | { ok: false; status: 401 | 403 }> {
  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, status: 401 };
  const { data: row } = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!row) return { ok: false, status: 403 };
  return { ok: true, sb };
}
