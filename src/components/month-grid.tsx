"use client";

import { dict, type Lang } from "@/lib/i18n";
import { monthRange } from "@/lib/tz";

export type GridState = "free" | "selected" | "filled" | "ringed" | "disabled";
export interface GridCellCfg {
  state: GridState;
  title?: string;
  dot?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

const CLASS: Record<GridState, string> = {
  free: "text-ink hover:bg-paper hover:shadow-[inset_0_0_0_1px_#e8e1d5]",
  selected: "bg-ink text-paper",
  filled: "bg-ink text-paper",
  ringed: "text-ink shadow-[inset_0_0_0_1.5px_#2f5240]",
  disabled: "text-soft/35",
};

/**
 * The single month-calendar component for the whole app.
 * Purely presentational: the caller owns all state and decides the state of
 * every day cell; navigation and selection bubble up through onMove/onSelect.
 */
export default function MonthGrid({
  lang,
  month,
  cells,
  onMove,
  onSelect,
  navDisabled = false,
}: {
  lang: Lang;
  month: string;
  cells: Record<string, GridCellCfg>;
  onMove?: (delta: -1 | 1) => void;
  onSelect?: (date: string) => void;
  navDisabled?: boolean;
}) {
  const t = dict[lang];
  const locale = lang === "pt" ? "pt-BR" : "en";
  const { days: nDays, startDow } = monthRange(month);
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + i, 12)), // 2024-01-07 was a Sunday
    ),
  );

  const nav = onMove ? (
    <div className="flex items-center justify-between">
      <button
        type="button"
        disabled={navDisabled}
        aria-label={t.prevM}
        onClick={() => onMove(-1)}
        className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
      >
        ‹ {t.prevM}
      </button>
      <p className="font-serif text-lg first-letter:uppercase">{label}</p>
      <button
        type="button"
        disabled={navDisabled}
        aria-label={t.nextM}
        onClick={() => onMove(1)}
        className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
      >
        {t.nextM} ›
      </button>
    </div>
  ) : null;

  return (
    <>
      {nav}
      <div className="mt-4 rounded-2xl border border-line bg-panel px-2 py-4 sm:px-7 sm:py-5">
        <div className="grid grid-cols-7 text-center">
          {dowLabels.map((d, i) => (
            <span key={i} className="label py-2">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5 justify-items-center">
          {Array.from({ length: startDow }).map((_, i) => (
            <span key={`e${i}`} className="h-9 w-9 sm:h-10 sm:w-10" />
          ))}
          {Array.from({ length: nDays }, (_, i) => {
            const iso = `${month}-${pad(i + 1)}`;
            const cfg = cells[iso] ?? { state: "disabled" as const };
            return (
              <div key={iso} className="relative">
                <button
                  type="button"
                  disabled={cfg.state === "disabled"}
                  title={cfg.title}
                  aria-pressed={cfg.state === "selected" || cfg.state === "filled"}
                  onClick={() => {
                    if (cfg.state !== "disabled" && onSelect) onSelect(iso);
                  }}
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors sm:h-10 sm:w-10 " +
                    CLASS[cfg.state]
                  }
                >
                  {i + 1}
                </button>
                {cfg.dot && (
                  <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
