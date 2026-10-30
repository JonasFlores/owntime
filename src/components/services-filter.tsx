"use client";

import { useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import { SERVICE_GRID } from "@/lib/service-grid";

export type Show = "all" | "active" | "inactive";

/**
 * Services table filter. The rows come from the server as ready-made slots;
 * toggling a pill just swaps which slots are rendered — no navigation, no
 * server round-trip, no re-mount of unchanged rows. The URL is kept in sync
 * with replaceState so a reload or router.refresh() preserves the choice.
 */
export default function ServicesFilter({
  lang,
  initialShow = "all",
  counts,
  activeRows,
  inactiveRows,
}: {
  lang: Lang;
  initialShow?: Show;
  counts: { all: number; active: number; inactive: number };
  activeRows: React.ReactNode;
  inactiveRows: React.ReactNode;
}) {
  const t = dict[lang];
  const [show, setShow] = useState<Show>(initialShow);

  const choose = (next: Show) => {
    setShow(next);
    const url = next === "all" ? "/gestao/schedule" : `/gestao/schedule?show=${next}`;
    window.history.replaceState(null, "", url);
  };

  const pills: [Show, string, number][] = [
    ["all", t.all, counts.all],
    ["active", t.active, counts.active],
    ["inactive", t.inactive, counts.inactive],
  ];

  const rows = (
    show === "active" ? activeRows : show === "inactive" ? inactiveRows : <>{activeRows}{inactiveRows}</>
  );
  const empty = show === "active" ? counts.active === 0 : show === "inactive" ? counts.inactive === 0 : counts.all === 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label">{t.services}</h2>
        <nav aria-label={t.services} className="flex flex-wrap gap-2">
          {pills.map(([key, text, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={show === key}
              onClick={() => choose(key)}
              className={
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors " +
                (show === key
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-soft hover:border-ink/40 hover:text-ink")
              }
            >
              {text}
              <span className="opacity-60">{count}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* table header — aligned to the same grid as the rows below */}
      <div className={`${SERVICE_GRID} mt-4 px-4 py-2.5 max-lg:hidden`}>
        <span className="label">{t.namePt}</span>
        <span className="label">{t.nameEn}</span>
        <span className="label">{t.duration}</span>
        <span className="label">{t.active}</span>
        <span className="label">{t.bookings}</span>
        <span />
        <span />
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-panel">
        {empty && <p className="px-4 py-10 text-sm text-soft">{t.noneInFilter}</p>}
        {rows}
      </div>
    </>
  );
}
