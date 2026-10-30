import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { requireAdmin } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import AdminShell from "@/components/admin-shell";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  let pendingCount = 0;

  if (isConfigured) {
    const { sb } = await requireAdmin();
    const result = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending");
    pendingCount = result.count ?? 0;
  }

  return (
    <AdminShell t={dict[lang]} pendingCount={pendingCount}>
      {children}
    </AdminShell>
  );
}
