"use client";

import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { createAppointment, type SubmitState } from "@/app/actions";
import { dict, type Lang } from "@/lib/i18n";
import MonthGrid, { type GridCellCfg } from "@/components/month-grid";
import { monthRange } from "@/lib/tz";

interface Props {
  service: { id: string; name: string; duration: number };
  lang: Lang;
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function BookingFlow({ service, lang }: Props) {
  const t = dict[lang];
  const router = useRouter();
  const locale = lang === "pt" ? "pt-BR" : "en";
  const now = new Date();

  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const monthStr = `${ym.y}-${pad(ym.m)}`;
  const [days, setDays] = useState<Record<string, number> | null>(null); // "2026-02-14" → free slot count
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const startedAt = useState(() => Date.now())[0];
  const [state, action, pending] = useActionState(createAppointment, { ok: false } as SubmitState);

  // month overview
  useEffect(() => {
    setDate(null);
    setSlot(null);
    setDays(null);
    const ctrl = new AbortController();
    fetch(`/api/availability?service=${service.id}&month=${monthStr}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((j) =>
        setDays(Object.fromEntries((j.days ?? []).map((d: { date: string; count: number }) => [d.date, d.count]))),
      )
      .catch(() => {});
    return () => ctrl.abort();
  }, [monthStr, service.id]);

  // day detail
  useEffect(() => {
    if (!date) return;
    setSlot(null);
    setSlots(null);
    const ctrl = new AbortController();
    fetch(`/api/availability?service=${service.id}&date=${date}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((j) => setSlots(j.slots ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [date, service.id]);

  useEffect(() => {
    if (state.ok) router.push("/thanks");
  }, [state.ok, router]);

  const moveMonth = (d: number) => {
    setSlot(null);
    setYm((prev) => {
      const z = prev.m + d;
      return z < 1 ? { y: prev.y - 1, m: 12 } : z > 12 ? { y: prev.y + 1, m: 1 } : { ...prev, m: z };
    });
  };

  // calendar cells: only days with free slots are selectable
  const { days: daysInMonth } = monthRange(monthStr);
  const cells: Record<string, GridCellCfg> = {};
  for (let i = 1; i <= daysInMonth; i++) {
    const iso = `${monthStr}-${pad(i)}`;
    const count = days?.[iso] ?? 0;
    cells[iso] = {
      state: date === iso ? "selected" : count > 0 ? "free" : "disabled",
    };
  }

  const dateLabel = date
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${date}T12:00:00Z`),
      )
    : null;

  const errorText: Record<string, string> = {
    taken: t.errTaken,
    form: t.errForm,
    rate: t.errRate,
    generic: t.errGeneric,
  };

  return (
    <div className="mt-10">
      {/* calendar */}
      <p className="label">{t.pickDate}</p>
      <div className="mt-4">
        <MonthGrid lang={lang} month={monthStr} cells={cells} onMove={moveMonth} onSelect={setDate} />
      </div>
      {days && !Object.values(days).some((c) => c > 0) && (
        <p className="mt-3 text-center text-sm text-soft">{t.noDays}</p>
      )}

      {/* times */}
      {date && (
        <div className="mt-8">
          <p className="label">{t.pickTime}</p>
          {!slots ? (
            <p className="mt-3 text-sm text-soft">{t.loading}</p>
          ) : slots.length === 0 ? (
            <p className="mt-3 text-sm text-soft">{t.noSlots}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={
                    "h-10 rounded-full px-4 text-sm transition-colors " +
                    (slot === s ? "bg-ink text-paper" : "border border-line bg-panel hover:border-ink/40")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* request form */}
      {date && slot && (
        <form action={action} className="mt-10 rounded-2xl border border-line bg-panel p-6 sm:p-8">
          <p className="label">{t.yourDetails}</p>
          <p className="mt-3 font-serif text-xl">
            {service.name} · {dateLabel?.charAt(0).toUpperCase()}
            {dateLabel?.slice(1)} · {slot}
          </p>

          {/* anti-spam */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <input type="hidden" name="service" value={service.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={slot} />
          <input type="hidden" name="ts" value={startedAt} />

          {state.error && (
            <p className="mt-5 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
              {errorText[state.error] ?? t.errGeneric}
            </p>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">{t.name}</span>
              <input name="name" required minLength={2} maxLength={80} placeholder={t.namePh} className="input mt-2" />
            </label>
            <label className="block">
              <span className="label">{t.phone}</span>
              <input name="phone" required maxLength={20} placeholder={t.phonePh} className="input mt-2" />
            </label>
            <label className="block">
              <span className="label">{t.email}</span>
              <input name="email" type="email" placeholder={t.emailPh} className="input mt-2" />
              <span className="mt-1 block text-xs text-soft">{t.emailHint}</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">{t.notes}</span>
              <input name="note" maxLength={500} placeholder={t.notesPh} className="input mt-2" />
            </label>
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary mt-8 w-full">
            {pending ? t.sending : t.send}
          </button>
        </form>
      )}
    </div>
  );
}
