"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/app/gestao/actions";
import type { Dict } from "@/lib/i18n";
import PendingBadge from "@/components/pending-badge";
import SubmitButton from "@/components/submit-button";

export default function AdminNav({
  t,
  pendingCount = 0,
}: {
  t: Dict;
  pendingCount?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === "/gestao/schedule"
    ? "setup"
    : pathname === "/gestao/integrations"
      ? "integrations"
      : searchParams.get("view") === "pending"
        ? "pending"
        : "bookings";

  const base = "pb-1 text-sm border-b transition-colors";
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-6">
      <Link
        href="/gestao"
        aria-current={active === "bookings" ? "page" : undefined}
        className={active === "bookings" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        {t.tabBookings}
      </Link>
      <Link
        href="/gestao?view=pending"
        aria-current={active === "pending" ? "page" : undefined}
        className={active === "pending" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        <span className="inline-flex items-center gap-2">
          {t.tabPending}
          <PendingBadge initialCount={pendingCount} />
        </span>
      </Link>
      <Link
        href="/gestao/schedule"
        prefetch={false}
        aria-current={active === "setup" ? "page" : undefined}
        className={active === "setup" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        {t.tabSetup}
      </Link>
      <Link
        href="/gestao/integrations"
        prefetch={false}
        aria-current={active === "integrations" ? "page" : undefined}
        className={active === "integrations" ? `${base} border-ink text-ink` : `${base} border-transparent text-soft hover:text-ink`}
      >
        {t.tabIntegrations}
      </Link>
      <form action={signOut} className="ml-auto">
        <SubmitButton className="cursor-pointer text-sm text-soft hover:text-ink">{t.logout}</SubmitButton>
      </form>
    </nav>
  );
}
