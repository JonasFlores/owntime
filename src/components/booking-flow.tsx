"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubmitState } from "@/lib/create-appointment";
import { dict, type Lang } from "@/lib/i18n";
import MonthGrid, { type GridCellCfg } from "@/components/month-grid";
import Spinner from "@/components/spinner";
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
  const [loadingDays, setLoadingDays] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const startedAt = useState(() => Date.now())[0];
  const [state, setState] = useState<SubmitState>({ ok: false });
  const [pending, setPending] = useState(false);

  // month overview
  useEffect(() => {
    setDate(null);
    setSlot(null);
    setDays(null);
    setLoadingDays(true);
    const ctrl = new AbortController();
    fetch(`/api/availability?service=${service.id}&month=${monthStr}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((j) =>
        setDays(Object.fromEntries((j.days ?? []).map((d: { date: string; count: number }) => [d.date, d.count]))),
      )
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingDays(false);
      });
    return () => ctrl.abort();
  }, [monthStr, service.id]);

  // day detail
  useEffect(() => {
    if (!date) return;
    setSlot(null);
    setSlots(null);
    setLoadingSlots(true);
    const ctrl = new AbortController();
    fetch(`/api/availability?service=${service.id}&date=${date}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((j) => setSlots(j.slots ?? []))
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingSlots(false);
      });
    return () => ctrl.abort();
  }, [date, service.id]);

  useEffect(() => {
    if (state.ok) router.push("/thanks");
  }, [state.ok, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setState({ ok: false });
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as SubmitState;
      setState(response.ok ? result : { ok: false, error: "generic" });
    } catch {
      setState({ ok: false, error: "generic" });
    } finally {
      setPending(false);
    }
  };

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
      <div className={"mt-4 transition-opacity " + (loadingDays ? "opacity-50" : "opacity-100")}>
        <MonthGrid lang={lang} month={monthStr} cells={cells} onMove={moveMonth} onSelect={setDate} />
      </div>
      {loadingDays ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-soft">
          <Spinner className="h-3.5 w-3.5" /> {t.loading}
        </p>
      ) : (
        days &&
        !Object.values(days).some((c) => c > 0) && (
          <p className="mt-3 text-center text-sm text-soft">{t.noDays}</p>
        )
      )}

      {/* times */}
      {date && (
        <div className="mt-8">
          <p className="label">{t.pickTime}</p>
          {loadingSlots ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-soft">
              <Spinner className="h-3.5 w-3.5" /> {t.loading}
            </p>
          ) : slots && slots.length === 0 ? (
            <p className="mt-3 text-sm text-soft">{t.noSlots}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {(slots ?? []).map((s) => (
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
        <form onSubmit={submit} className="mt-10 rounded-2xl border border-line bg-panel p-6 sm:p-8">
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
              <input name="email" type="email" required maxLength={120} placeholder={t.emailPh} className="input mt-2" />
              <span className="mt-1 block text-xs text-soft">{t.emailHint}</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">{t.notes}</span>
              <input name="note" maxLength={500} placeholder={t.notesPh} className="input mt-2" />
            </label>
          </div>
          <button type="submit" disabled={pending} aria-busy={pending || undefined} className="btn btn-primary mt-8 w-full">
            {pending && <Spinner className="h-4 w-4" />}
            {pending ? t.sending : t.send}
          </button>
        </form>
      )}
    </div>
  );
}
