import Link from "next/link";
import { signOut } from "@/app/gestao/actions";
import type { Dict, Lang } from "@/lib/i18n";

export default function AdminNav({ t, lang, active }: { t: Dict; lang: Lang; active: "bookings" | "setup" | "login" }) {
  if (active === "login") return null;
  const base = "pb-1 text-sm border-b transition-colors";
  return (
    <nav className="flex items-center gap-6">
      <Link
        href="/gestao"
        className={active === "bookings" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        {t.tabBookings}
      </Link>
      <Link
        href="/gestao/schedule"
        className={active === "setup" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        {t.tabSetup}
      </Link>
      <form action={signOut} className="ml-auto">
        <button type="submit" className="text-sm text-soft hover:text-ink">
          {t.logout}
        </button>
      </form>
    </nav>
  );
}
