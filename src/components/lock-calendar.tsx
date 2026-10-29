"use client";

import { useEffect, useMemo, useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import { dayBounds, monthRange, shiftMonth } from "@/lib/tz";
import { toggleDayLock, saveLock, removeLock, updateLockNote, type AdminResult } from "@/app/gestao/actions";
import { fmtShort, fmtTime } from "@/lib/format";
import MonthGrid, { type GridCellCfg } from "@/components/month-grid";

interface LockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  note: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

const SUCCESS_KEY: Record<string, "msgSaved" | "msgLocked" | "msgUnlocked"> = {
  saved: "msgSaved",
  locked: "msgLocked",
  unlocked: "msgUnlocked",
};

/**
 * Admin month calendar for day/period blocks, built on the shared MonthGrid.
 * Day rules: past days and days closed in the weekly hours are inactive;
 * locked days are filled; partially blocked days carry a green dot.
 */
export default function LockCalendar({
  lang,
  tz,
  initialMonth,
  initialLocks,
  closedDows,
}: {
  lang: Lang;
  tz: string;
  initialMonth: string;
  initialLocks: LockRow[];
  closedDows: number[];
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

  // "today" in the business timezone, for past-day checks
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    [tz],
  );

  // ---- locking state
  const { first, days: nDays } = monthRange(month);
  const monthStart = dayBounds(first, tz).starts_at;
  const monthEndExclusive = dayBounds(`${shiftMonth(month, 1)}-01`, tz).starts_at;
  const monthLocks = locks.filter((r) => r.starts_at < monthEndExclusive && r.ends_at > monthStart);

  const lockState = (date: string): "full" | "partial" | null => {
    const b = dayBounds(date, tz);
    let kind: "full" | "partial" | null = null;
    for (const r of monthLocks) {
      if (r.starts_at === b.starts_at && r.ends_at === b.ends_at) return "full";
      if (r.starts_at < b.ends_at && r.ends_at > b.starts_at) kind = "partial";
    }
    return kind;
  };

  const cells: Record<string, GridCellCfg> = {};
  for (let i = 1; i <= nDays; i++) {
    const iso = `${month}-${pad(i)}`;
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (iso < today) {
      cells[iso] = { state: "disabled", title: t.pastDay };
      continue;
    }
    if (closedDows.includes(dow)) {
      cells[iso] = { state: "disabled", title: t.closed };
      continue;
    }
    const far = lockState(iso);
    cells[iso] =
      far === "full"
        ? { state: "filled", title: t.locked }
        : far === "partial"
          ? { state: "ringed", dot: true, title: t.lockedPartial }
          : { state: "free" };
  }

  // ---- actions (server actions called directly, then local refresh)
  const runAction = async (
    name: "toggleDayLock" | "saveLock" | "removeLock",
    fd: FormData,
    silentOnSuccess: boolean,
  ) => {
    const action = name === "toggleDayLock" ? toggleDayLock : name === "saveLock" ? saveLock : removeLock;
    setBusy(true);
    setMsg(null);
    try {
      const res = await action(null, fd);
      await refetch();
      if (!(silentOnSuccess && res.ok)) setMsg(res);
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = async (date: string) => {
    const fd = new FormData();
    fd.set("date", date);
    await runAction("toggleDayLock", fd, true); // the circle flip itself is the confirmation
  };

  const submitPeriod = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await runAction("saveLock", new FormData(e.currentTarget), false);
  };

  const unlock = async (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    await runAction("removeLock", fd, true); // row disappears = confirmation
  };

  return (
    <>
      <MonthGrid
        lang={lang}
        month={month}
        cells={cells}
        onMove={(d) => setMonth(shiftMonth(month, d))}
        onSelect={(iso) => void toggleDay(iso)}
        navDisabled={busy}
      />
      {msg && (
        <p role="status" className={"mt-3 flex gap-2 text-sm " + (msg.ok ? "text-accent" : "text-warn")}>
          {msg.ok ? t[SUCCESS_KEY[msg.code ?? ""] ?? "msgSaved"] : t.msgError}
          {!msg.ok && msg.detail && <span className="text-xs opacity-70">{msg.detail}</span>}
        </p>
      )}
      <p className="mt-2 flex items-center justify-center gap-2 text-xs text-soft">
        <span className="inline-block h-3 w-3 rounded-full bg-ink" /> {t.locked}
        <span className="inline-block h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_#2f5240]" /> {t.lockedPartial}
      </p>

      {/* block a partial period */}
      <form
        onSubmit={submitPeriod}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-6"
      >
        <label className="block">
          <span className="label">{t.addLock}</span>
          <input type="date" name="date" required className="input mt-1.5" />
        </label>
        <input type="time" name="start" required className="input w-24" aria-label="start" />
        <input type="time" name="end" required className="input w-24" aria-label="end" />
        <input
          name="note"
          maxLength={200}
          placeholder={t.lockNotePh}
          className="input w-full sm:w-56"
          aria-label={t.editNote}
        />
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
            <li key={r.id} className="py-3 text-sm">
              <div className="flex items-center justify-between">
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
                  className="text-soft underline decoration-line underline-offset-4 hover:text-ink"
                >
                  {t.unlock}
                </button>
              </div>
              {r.note && <p className="mt-1 text-xs italic text-soft">{r.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
