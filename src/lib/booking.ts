import { getSupabase, isConfigured } from "./supabase";

export interface ServiceRow {
  id: string;
  name_pt: string;
  name_en: string;
  duration_minutes: number;
  active: boolean;
}

export interface AppointmentRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  note: string | null;
  created_at: string;
  services: { name_pt: string; name_en: string; duration_minutes: number } | null;
}

export async function getServices(): Promise<ServiceRow[]> {
  if (!isConfigured) return [];
  const sb = await getSupabase();
  const { data } = await sb
    .from("services")
    .select("id,name_pt,name_en,duration_minutes")
    .eq("active", true)
    .order("sort_order");
  return (data ?? []) as ServiceRow[];
}

export function serviceName(s: ServiceRow | { name_pt: string; name_en: string }, lang: "pt" | "en"): string {
  return lang === "pt" ? s.name_pt : s.name_en;
}
