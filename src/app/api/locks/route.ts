import { NextResponse } from "next/server";
import { getSupabase, isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** All time-off locks for the admin calendar (session-guarded; RLS as backstop). */
export async function GET() {
  if (!isConfigured) return NextResponse.json({ locks: [] });

  const sb = await getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: adm } = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adm) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await sb
    .from("time_off")
    .select("id,starts_at,ends_at,reason")
    .order("starts_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locks: data ?? [] });
}
