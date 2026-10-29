"use client";

import { useEffect, useMemo, useState } from "react";
import { dict, type Lang } from "@/lib/i18n";
import { dayBounds, monthRange, shiftMonth } from "@/lib/tz";
import { rangesOverlap } from "@/lib/time";
import {
  decide,
  updateAppointment,
  toggleDayLock,
  saveLock,
  removeLock,
  updateLockNote,
  type AdminResult,
} from "@/app/gestao/actions";

interface Appt {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  note: string | null;
  services: { name_pt: string; name_en: string; duration_minutes: number } | null;
}

interface Lock {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  note: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

const addDaysIso = (iso: string, n: number) =>
  new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/** success codes → flash-message dictionary keys */
const MSG_KEY: Record<string, string> = {
  approved: "msgApproved",
  rejected: "msgDeclined",
  updated: "msgUpdated",
  saved: "msgSaved",
  unlocked: "msgUnlocked",
};

/**
 * The admin dashboard: a Google/Notion-style month calendar with appointment
 * chips and block notes. Click a day for its detail panel (decisions, edits,
 * block notes). This is an events calendar — a different anatomy from the
 * picker MonthGrid, so it has its own grid.
 */
export default function BookingsCalendar({
  lang,
  tz,
  initialMonth,
  closedDows,
}: {
  lang: Lang;
  tz: string;
  initialMonth?: string;
  closedDows: number[];
}) {
  const t = dict[lang];
  const locale = lang === "pt" ? "pt-BR" : "en";
  const todayInTz = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()),
    [tz],
  );

  const [month, setMonth] = useState(initialMonth ?? todayInTz.slice(0, 7));
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [locks, setLocks] = useState<Lock[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLock, setEditingLock] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState<"day" | "period" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<AdminResult | null>(null);

  // ---- visible window = exactly the 6-week grid below (leading/trailing days included)
  const { days: nDays, startDow } = monthRange(month);
  const firstCell = addDaysIso(`${month}-01`, -startDow);
  const nCells = Math.ceil((startDow + nDays) / 7) * 7;
  const lastCell = addDaysIso(firstCell, nCells - 1);
  const winFrom = dayBounds(firstCell, tz).starts_at;
  const winTo = dayBounds(addDaysIso(lastCell, 1), tz).starts_at;

  const load = async (signal?: AbortSignal) => {
    const [a, l] = await Promise.all([
      fetch(`/api/appointments?from=${encodeURIComponent(winFrom)}&to=${encodeURIComponent(winTo)}`, { signal }),
      fetch("/api/locks", { signal }),
    ]);
    if (a.ok) setAppts(((await a.json()).appointments ?? []) as Appt[]);
    if (l.ok) setLocks(((await l.json()).locks ?? []) as Lock[]);
  };

  useEffect(() => {
    setAppts(null);
    setLocks(null);
    setMsg(null);
    const ctrl = new AbortController();
    load(ctrl.signal).catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winFrom, winTo]);

  // keep a sensible selection across month navigation
  useEffect(() => {
    setSelected((prev) => {
      if (prev && prev >= firstCell && prev <= lastCell) return prev;
      return todayInTz >= firstCell && todayInTz <= lastCell ? todayInTz : null;
    });
  }, [firstCell, lastCell, todayInTz]);

  // ---- mutations: run server action, then reload both feeds in place
  const run = async (
    fn: (prev: AdminResult | null, fd: FormData) => Promise<AdminResult>,
    fd: FormData,
    opts?: { silent?: boolean },
  ) => {
    setBusy(true);
    if (!opts?.silent) setMsg(null);
    try {
      const res = await fn(null, fd);
      await load();
      if (!opts?.silent || !res.ok) setMsg(res); // silent successes speak through the UI itself
      return res;
    } finally {
      setBusy(false);
    }
  };

  const setDecision = async (id: string, status: "approved" | "rejected") => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    await run(decide, fd);
  };

  const submitEdit = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", id);
    const res = await run(updateAppointment, fd);
    if (res.ok) setEditingId(null);
  };

  const submitBlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected || !addingBlock) return;
    const fd = new FormData(e.currentTarget);
    fd.set("date", selected);
    const res = await run(addingBlock === "day" ? toggleDayLock : saveLock, fd);
    if (res.ok) setAddingBlock(null);
  };

  const unlock = async (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    await run(removeLock, fd, { silent: true });
  };

  const submitLockNote = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", id);
    const res = await run(updateLockNote, fd);
    if (res.ok) setEditingLock(null);
  };

  // ---- formatting helpers independent of the server env (tz passed as prop)
  const hhmm = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: tz,
    }).format(new Date(iso));
  const isoDateInTz = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + i, 12)), // 2024-01-07 was a Sunday
    ),
  );

  // ---- build the day cells (locks + live appointments per day)
  const cells: { iso: string; outside: boolean; past: boolean; closed: boolean; locksOn: Lock[]; apptsOn: Appt[] }[] = [];
  for (let i = 0; i < nCells; i++) {
    const iso = addDaysIso(firstCell, i);
    const b = dayBounds(iso, tz);
    cells.push({
      iso,
      outside: !iso.startsWith(month),
      past: iso < todayInTz,
      closed: closedDows.includes(new Date(`${iso}T12:00:00Z`).getUTCDay()),
      locksOn: (locks ?? []).filter((r) => rangesOverlap(r.starts_at, r.ends_at, b.starts_at, b.ends_at)),
      apptsOn: (appts ?? []).filter((x) => rangesOverlap(x.starts_at, x.ends_at, b.starts_at, b.ends_at)),
    });
  }

  // selected day feeds
  const dayLocks = selected
    ? (locks ?? []).filter((r) => {
        const b = dayBounds(selected, tz);
        return rangesOverlap(r.starts_at, r.ends_at, b.starts_at, b.ends_at);
      })
    : [];
  const dayAppts = selected
    ? (appts ?? []).filter((x) => {
        const b = dayBounds(selected, tz);
        return rangesOverlap(x.starts_at, x.ends_at, b.starts_at, b.ends_at);
      })
    : [];

  const msgText = msg
    ? msg.ok
      ? t[(MSG_KEY[msg.code ?? ""] ?? "msgSaved") as keyof typeof t] ?? t.msgSaved
      : t.msgError
    : null;

  return (
    <>
      {/* month navigation — in place, no reload */}
      <div className="mt-8 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            aria-label={t.prevM}
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={t.nextM}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
          >
            ›
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMonth(todayInTz.slice(0, 7))}
            className="btn btn-sm border-transparent px-3 text-soft hover:border-line"
          >
            {t.today}
          </button>
        </div>
        <p className="font-serif text-xl first-letter:uppercase">{monthLabel}</p>
      </div>
      {(appts === null || locks === null) && <p className="mt-2 text-xs text-soft">{t.loading}</p>}

      {/* the calendar grid (hairline borders via 1px gaps) */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-line">
        <div className="grid grid-cols-7 gap-px bg-line">
          {dowLabels.map((d, i) => (
            <span key={i} className={(closedDows.includes(i) ? "bg-paper text-soft " : "bg-panel ") + "py-2 text-center label"}>
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px border-t border-line bg-line">
          {cells.map((c) => {
            const lockChips = c.locksOn.map((r) => {
              const full = r.reason !== "locked-period";
              return { key: `l${r.id}`, full, label: full ? r.note || t.locked : `${hhmm(r.starts_at)} ${r.note || ""}`.trim() };
            });
            const apptChips = c.apptsOn.map((x) => ({
              key: `a${x.id}`,
              pending: x.status === "pending",
              label: `${hhmm(x.starts_at)} ${x.guest_name}`,
            }));
            const chips = [...lockChips, ...apptChips];
            const extra = chips.length - 3;
            const dots = [
              ...c.locksOn.map(() => "bg-ink"),
              ...c.apptsOn.map((x) => (x.status === "pending" ? "bg-warn" : "bg-accent")),
            ].slice(0, 6);
            const inactive = c.outside || c.past || c.closed;
            return (
              <button
                key={c.iso}
                type="button"
                aria-pressed={selected === c.iso}
                onClick={() => setSelected(c.iso)}
                className={
                  "min-h-[7rem] p-1.5 text-left align-top transition-colors " +
                  (inactive ? "bg-paper" : "bg-panel") +
                  (c.past ? " opacity-55" : "") +
                  (selected === c.iso ? " shadow-[inset_0_0_0_1.5px_#2f5240]" : "") +
                  (selected !== c.iso ? " hover:bg-panel" : "")
                }
              >
                <span
                  className={
                    "text-sm " +
                    (c.outside
                      ? "text-soft/35"
                      : c.iso === todayInTz
                        ? "font-semibold text-accent"
                        : c.past || c.closed
                          ? "text-soft"
                          : "text-ink")
                  }
                >
                  {Number(c.iso.slice(8, 10))}
                </span>
                {c.iso === todayInTz && <span className="sr-only"> ({t.today})</span>}

                {/* event chips: desktop */}
                <span className="mt-1 hidden flex-col gap-1 sm:flex">
                  {chips.slice(0, 3).map((ch) =>
                    "full" in ch ? (
                      <span
                        key={ch.key}
                        title={ch.label}
                        className={
                          "block truncate rounded-md px-1.5 py-0.5 text-[11px] leading-5 " +
                          (ch.full ? "bg-ink text-paper" : "bg-accent/10 text-ink shadow-[inset_2px_0_0_#2f5240]")
                        }
                      >
                        {ch.label}
                      </span>
                    ) : (
                      <span
                        key={ch.key}
                        title={ch.label}
                        className={
                          "flex items-center gap-1 truncate rounded-md border bg-panel px-1.5 py-0.5 text-[11px] leading-5 " +
                          (ch.pending ? "border-dashed border-warn/60 text-ink" : "border-line text-ink")
                        }
                      >
                        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (ch.pending ? "bg-warn" : "bg-accent")} />
                        <span className="truncate">{ch.label}</span>
                      </span>
                    ),
                  )}
                  {extra > 0 && <span className="px-1.5 text-[11px] text-soft">+{extra} {t.more}</span>}
                </span>

                {/* dots: mobile */}
                {dots.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {dots.map((d, i) => (
                      <span key={i} className={"h-1.5 w-1.5 rounded-full " + d} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent" /> {t.stApproved}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warn" /> {t.stPending}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink" /> {t.locked}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-line bg-paper" /> {t.closed}
        </span>
        <span className="opacity-55">{t.pastDay}</span>
      </p>

      {msg && (
        <p role="status" className={"mt-4 flex gap-2 text-sm " + (msg.ok ? "text-accent" : "text-warn")}>
          {msgText}
          {!msg.ok && msg.code === "taken" && <span className="text-xs opacity-70">{t.errTaken}</span>}
          {!msg.ok && msg.detail && msg.code !== "taken" && <span className="text-xs opacity-70">{msg.detail}</span>}
        </p>
      )}

      {/* ----- day detail panel ----- */}
      {selected ? (
        <section className="mt-10 rounded-2xl border border-line bg-panel p-5 sm:p-7">
          <h2 className="font-serif text-xl first-letter:uppercase">{dayLabel(selected)}</h2>

          {/* existing blocks: note is visible and editable */}
          {dayLocks.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {dayLocks.map((lk) => (
                <div key={lk.id} className="rounded-xl border border-line bg-paper px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="label">
                      {lk.reason === "locked-period"
                        ? `${t.locked} · ${hhmm(lk.starts_at)}–${hhmm(lk.ends_at)}`
                        : t.locked}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <button
                        type="button"
                        onClick={() => setEditingLock(editingLock === lk.id ? null : lk.id)}
                        className="text-soft underline decoration-line underline-offset-4 hover:text-ink"
                      >
                        {lk.note ? t.editNote : t.addNote}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void unlock(lk.id)}
                        className="text-soft underline decoration-line underline-offset-4 hover:text-ink"
                      >
                        {t.unlock}
                      </button>
                    </div>
                  </div>
                  {lk.note && editingLock !== lk.id && <p className="mt-1 text-sm italic">{lk.note}</p>}
                  {editingLock === lk.id && (
                    <form key={lk.id} onSubmit={(e) => submitLockNote(e, lk.id)} className="mt-2 flex flex-wrap items-end gap-2">
                      <input
                        name="note"
                        defaultValue={lk.note ?? ""}
                        maxLength={200}
                        placeholder={t.lockNotePh}
                        className="input min-w-0 flex-1"
                        aria-label={t.editNote}
                      />
                      <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
                        {t.save}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingLock(null)}>
                        {t.cancel}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* all blocking now lives beside the calendar, not in Setup */}
          {selected >= todayInTz && (
            <div className="mt-4">
              {addingBlock === null ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAddingBlock(dayLocks.some((lk) => lk.reason !== "locked-period") ? "period" : "day")}
                  className="btn btn-sm"
                >
                  {t.newBlock}
                </button>
              ) : (
                <form onSubmit={submitBlock} className="rounded-xl border border-dashed border-line bg-paper p-4">
                  <div className="flex flex-wrap gap-2">
                    {!dayLocks.some((lk) => lk.reason !== "locked-period") && (
                      <button
                        type="button"
                        onClick={() => setAddingBlock("day")}
                        className={"btn btn-sm " + (addingBlock === "day" ? "btn-primary" : "")}
                      >
                        {t.wholeDay}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddingBlock("period")}
                      className={"btn btn-sm " + (addingBlock === "period" ? "btn-primary" : "")}
                    >
                      {t.timePeriod}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    {addingBlock === "period" && (
                      <>
                        <input type="time" name="start" required className="input w-28" aria-label="start" />
                        <input type="time" name="end" required className="input w-28" aria-label="end" />
                      </>
                    )}
                    <input
                      name="note"
                      maxLength={200}
                      placeholder={t.lockNotePh}
                      className="input min-w-48 flex-1"
                      aria-label={t.editNote}
                    />
                    <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
                      {t.save}
                    </button>
                    <button type="button" onClick={() => setAddingBlock(null)} className="btn btn-sm">
                      {t.cancel}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* the day's appointments */}
          {dayAppts.length === 0 ? (
            <p className="mt-4 text-sm text-soft">{t.empty}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {dayAppts.map((x) => {
                const dead = x.status === "rejected" || x.status === "cancelled";
                return (
                  <li key={x.id} className={"py-4 " + (dead ? "opacity-55" : "")}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-serif text-lg">
                          {hhmm(x.starts_at)}–{hhmm(x.ends_at)}
                        </span>
                        <span className={"font-serif text-lg " + (dead ? "line-through" : "")}>{x.guest_name}</span>
                        <span
                          className={
                            "rounded-full border px-2.5 py-0.5 text-xs " +
                            (x.status === "approved"
                              ? "border-accent/50 text-accent"
                              : x.status === "pending"
                                ? "border-dashed border-warn/70 text-warn"
                                : "border-line text-soft")
                          }
                        >
                          {x.status === "approved"
                            ? t.stApproved
                            : x.status === "pending"
                              ? t.stPending
                              : x.status === "rejected"
                                ? t.stDeclined
                                : t.stCancelled}
                        </span>
                      </div>
                      {!dead && editingId !== x.id && (
                        <div className="flex gap-2">
                          {x.status === "pending" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setDecision(x.id, "approved")}
                              className="btn btn-sm btn-primary"
                            >
                              {t.approve}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void setDecision(x.id, "rejected")}
                            className="btn btn-sm"
                          >
                            {t.reject}
                          </button>
                          {x.status === "approved" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setEditingLock(null);
                                setEditingId(x.id);
                              }}
                              className="btn btn-sm"
                            >
                              {t.editAppt}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-sm">
                      {x.services ? (lang === "pt" ? x.services.name_pt : x.services.name_en) : "—"}
                      <span className="text-soft"> · {x.services?.duration_minutes ?? "?"} {t.minutes}</span>
                      <span className="text-soft"> · </span>
                      <a href={`tel:${x.guest_phone}`} className="underline decoration-line underline-offset-4">
                        {x.guest_phone}
                      </a>
                      {x.guest_email && (
                        <>
                          <span className="text-soft"> · </span>
                          <a href={`mailto:${x.guest_email}`} className="underline decoration-line underline-offset-4">
                            {x.guest_email}
                          </a>
                        </>
                      )}
                    </p>
                    {x.note && !dead && <p className="mt-1 text-sm italic text-soft">"{x.note}"</p>}

                    {editingId === x.id && (
                      <form
                        key={x.id}
                        onSubmit={(e) => submitEdit(e, x.id)}
                        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-2"
                      >
                        <p className="label sm:col-span-2">{t.editTitle}</p>
                        <input
                          type="date"
                          name="date"
                          required
                          defaultValue={isoDateInTz(x.starts_at)}
                          className="input"
                          aria-label={t.pickDate}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <input type="time" name="start" required defaultValue={hhmm(x.starts_at)} className="input" aria-label="start" />
                          <input type="time" name="end" defaultValue={hhmm(x.ends_at)} className="input" aria-label="end" />
                        </div>
                        <input name="guest_name" required minLength={2} maxLength={80} defaultValue={x.guest_name} className="input" aria-label={t.name} />
                        <input name="guest_phone" required maxLength={20} defaultValue={x.guest_phone} className="input" aria-label={t.phone} />
                        <input
                          name="guest_email"
                          type="email"
                          required
                          maxLength={120}
                          defaultValue={x.guest_email ?? ""}
                          placeholder={t.emailPh}
                          className="input"
                          aria-label={t.email}
                        />
                        <input
                          name="note"
                          maxLength={500}
                          defaultValue={x.note ?? ""}
                          placeholder={t.notesPh}
                          className="input"
                          aria-label={t.notes}
                        />
                        <div className="flex justify-end gap-2 sm:col-span-2">
                          <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>
                            {t.cancel}
                          </button>
                          <button type="submit" disabled={busy} className="btn btn-sm btn-primary">
                            {t.save}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : (
        <p className="mt-10 text-sm text-soft">{t.selDay}</p>
      )}
    </>
  );
}
