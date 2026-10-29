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
  if (!user) redirect("/admin/login");
  const { data: row } = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!row) redirect("/admin/login?error=denied");
  return { sb, user };
}
