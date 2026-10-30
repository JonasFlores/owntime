import { Suspense } from "react";
import type { Dict } from "@/lib/i18n";
import AdminNav from "@/components/admin-nav";

/** Persistent shell for authenticated admin routes. It lives in the route
 * layout, so client navigation replaces only the page content below the nav. */
export default function AdminShell({
  t,
  pendingCount,
  children,
}: {
  t: Dict;
  pendingCount: number;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-16 sm:px-6">
      <Suspense fallback={<div className="h-6" aria-hidden="true" />}>
        <AdminNav t={t} pendingCount={pendingCount} />
      </Suspense>
      {children}
    </main>
  );
}
