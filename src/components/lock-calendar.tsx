"use client";

import { useEffect, useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import { dayBounds, monthRange } from "@/lib/tz";
import { toggleDayLock, saveLock, removeLock, type AdminResult } from "@/app/gestao/actions";
import { fmtShort, fmtTime } from "@/lib/format";

interface LockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function shiftMonth(m: string, d: number): string {
  const [y, mo] = m.split("-").map(Number);
  const z = mo + d;
  return z < 1 ? `${y - 1}-12` : z > 12 ? `${y + 1}-01` : `${y}-${pad(z)}`;
}

const SUCCESS_KEY: Record<string, "msgSaved" | "msgLocked" | "msgUnlocked"> = {
  saved: "msgSaved",
  locked: "msgLocked",
  unlocked: "msgUnlocked",
};

/**
 * Fully client-side month calendar for day/period blocks:
 * weekday header, in-place month navigation (no page reload),
 * day toggles and partial blocks through server actions.
 */
export default function LockCalendar({
  lang,
  tz,
  initialMonth,
  initialLocks,
}: {
  lang: Lang;
  tz: string;
  initialMonth: string;
  initialLocks: LockRow[];
}) {
  const t = dict[lang];
  const locale = lang === "pt" ? "pt-BR" : "en";
  const [month, setMonth] = useState(initialMonth);
  const [locks, setLocks] = useState<LockRow[]>(initialLocks);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<AdminResult | null>(null);

  const refetch = async () => {
    const r = await fetch("/api/locks");
    if (r.ok) setLocks(((await r.json()).locks ?? []) as LockRow[]);
  };

  useEffect(() => {
    void refetch();
  }, [month]);

  // ---- calendar math (pure, client-safe)
  const { first, days: nDays, startDow } = monthRange(month);
  const monthEndExclusive = dayBounds(`${shiftMonth(month, 1)}-01`, tz).starts_at;
  const monthStart = dayBounds(first, tz).starts_at;
  const monthLocks = locks.filter((r) => r.starts_at < monthEndExclusive && r.ends_at > monthStart);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + i, 12)),
    ), // 2024-01-07 was a Sunday
  );

  const stateFor = (date: string): "full" | "partial" | null => {
    const b = dayBounds(date, tz);
    let kind: "full" | "partial" | null = null;
    for (const r of monthLocks) {
      if (r.starts_at === b.starts_at && r.ends_at === b.ends_at) return "full";
      if (r.starts_at < b.ends_at && r.ends_at > b.starts_at) kind = "partial";
    }
    return kind;
  };

  // ---- actions (server actions called directly, then local refresh)
  const dayState = async (actionName: "toggleDayLock" | "saveLock" | "removeLock", fd: FormData) => {
    const action = actionName === "toggleDayLock" ? toggleDayLock : actionName === "saveLock" ? saveLock : removeLock;
    setBusy(true);
    setMsg(null);
    try {
      const res = await action(null, fd);
      await refetch();
      if (actionName !== "toggleDayLock" || !res.ok) setMsg(res);
      return res;
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = async (date: string) => {
    const fd = new FormData();
    fd.set("date", date);
    await dayState("toggleDayLock", fd);
  };

  const submitPeriod = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await dayState("saveLock", new FormData(e.currentTarget));
  };

  const unlock = async (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    await dayState("removeLock", fd);
  };

  return (
    <>
      {/* header with in-place month navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          disabled={busy}
          aria-label={t.prevM}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
        >
          ‹ {t.prevM}
        </button>
        <p className="font-serif text-lg first-letter:uppercase">
          {monthLabel} <span className="text-soft">· {month.replace("-", "/")}</span>
        </p>
        <button
          type="button"
          disabled={busy}
          aria-label={t.nextM}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
        >
          {t.nextM} ›
        </button>
      </div>
      {msg && (
        <p
          role="status"
          className={
            "mt-3 flex gap-2 text-sm " + (msg.ok ? "text-accent" : "text-warn")
          }
        >
          {msg.ok ? t[SUCCESS_KEY[msg.code ?? ""] ?? "msgSaved"] : t.msgError}
          {!msg.ok && msg.detail && <span className="text-xs opacity-70">{msg.detail}</span>}
        </p>
      )}

      {/* real calendar grid */}
      <div className="mt-4 rounded-2xl border border-line bg-panel px-5 py-5 sm:px-7">
        <div className="grid grid-cols-7 text-center">
          {dowLabels.map((d, i) => (
            <span key={i} className="label py-2">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5 justify-items-center">
          {Array.from({ length: startDow }).map((_, i) => (
            <span key={`e${i}`} className="h-10 w-10" />
          ))}
          {Array.from({ length: nDays }, (_, i) => {
            const date = `${month}-${pad(i + 1)}`;
            const st = stateFor(date);
            const d = i + 1;
            return (
              <div key={date} className="relative">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleDay(date)}
                  title={st === "full" ? t.locked : st === "partial" ? t.lockedPartial : undefined}
                  aria-pressed={st === "full"}
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm transition-colors " +
                    (st === "full"
                      ? "bg-ink text-paper"
                      : st === "partial"
                        ? "text-ink shadow-[inset_0_0_0_1.5px_#2f5240]"
                        : "text-ink hover:bg-paper hover:shadow-[inset_0_0_0_1px_#e8e1d5]")
                  }
                >
                  {d}
                </button>
                {st === "partial" && (
                  <span className="absolute left-1/2 bottom-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 flex items-center justify-center gap-2 text-xs text-soft">
        <span className="inline-block h-3 w-3 rounded-full bg-ink" /> {t.locked}
        <span className="inline-block h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_#2f5240]" /> {t.lockedPartial}
      </p>

      {/* block a partial period */}
      <form onSubmit={submitPeriod} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-6">
        <label className="block">
          <span className="label">{t.addLock}</span>
          <input type="date" name="date" required className="input mt-1.5" />
        </label>
        <input type="time" name="start" required className="input w-24" aria-label="start" />
        <input type="time" name="end" required className="input w-24" aria-label="end" />
        <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
          {t.save}
        </button>
      </form>

      {/* existing locks this month */}
      {monthLocks.length === 0 ? (
        <p className="mt-4 text-sm text-soft">{t.empty}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {monthLocks.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3 text-sm">
              <span>
                {fmtShort(r.starts_at, lang)}
                {r.reason === "locked-period" && (
                  <>
                    <span className="text-soft"> · </span>
                    {fmtTime(r.starts_at, lang)}–{fmtTime(r.ends_at, lang)}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => void unlock(r.id)}
                disabled={busy}
                className="text-sm text-soft underline decoration-line underline-offset-4 hover:text-ink"
              >
                {t.unlock}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
