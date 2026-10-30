"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live pending-request count. Polling is deliberately small and boring:
 * reliable behind Hostinger/Node proxies, unlike a long-lived socket, and the
 * endpoint performs only a HEAD/count query. It also refreshes on tab focus.
 */
export default function PendingBadge({ initialCount }: { initialCount: number }) {
  const [remoteCount, setRemoteCount] = useState<number | null>(null);
  const count = remoteCount ?? initialCount;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/appointments/pending-count", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { count?: number };
      if (typeof body.count === "number") setRemoteCount(body.count);
    } catch {
      // Keep the last known count; the next interval/focus retries quietly.
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 10_000);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  if (count <= 0) return null;
  return (
    <span
      aria-live="polite"
      aria-label={String(count)}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
