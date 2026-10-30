import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase";

/** Service-role client for webhooks and cron jobs that have no user session. */
export function getAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("supabase-service-role-not-configured");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
