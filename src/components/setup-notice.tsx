import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";

/** Shown on public + admin pages when Supabase env vars are not set yet. */
export default async function SetupNotice({ compact = false }: { compact?: boolean }) {
  const t = dict[await getLang()];
  if (compact) return <p className="text-sm text-soft">{t.setupHint}</p>;
  return (
    <p className="mt-14 rounded-xl border border-line bg-panel px-5 py-4 text-sm text-soft">
      {t.setupHint}
    </p>
  );
}
