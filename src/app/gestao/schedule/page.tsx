import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { fmtShort, fmtTime, localeOf } from "@/lib/format";
import type { ServiceRow } from "@/lib/booking";
import { saveService, saveHours, toggleDayLock, saveLock, removeLock } from "@/app/gestao/actions";
import { dayBounds, monthRange, BOOKING_TZ } from "@/lib/tz";
import AdminNav from "@/components/admin-nav";
import Flash from "@/components/flash";
import SetupNotice from "@/components/setup-notice";

const pad = (n: number) => String(n).padStart(2, "0");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
}

interface LockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export default async function AdminSchedule({ searchParams }: { searchParams: Promise<{ m?: string; msg?: string; d?: string }> }) {
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m)
    ? sp.m
    : new Intl.DateTimeFormat("en-CA", { timeZone: BOOKING_TZ }).format(new Date()).slice(0, 7);
  const lang = await getLang();
  const t = dict[lang];
  const locale = localeOf(lang);

  if (!isConfigured)
    return (
      <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-8">
        <AdminNav t={t} lang={lang} active="setup" />
        <h1 className="mt-10 font-serif text-3xl">{t.tabSetup}</h1>
        <SetupNotice />
      </main>
    );

  const { sb } = await requireAdmin();
  const [svc, wh, to] = await Promise.all([
    sb.from("services").select("*").order("sort_order"),
    sb.from("working_hours").select("*").order("day_of_week"),
    sb.from("time_off").select("*").order("starts_at"),
  ]);
  const services = (svc.data ?? []) as unknown as ServiceRow[];
  const hours = new Map<number, { open: boolean; start_time: string; end_time: string }>(
    ((wh.data ?? []) as { day_of_week: number; open: boolean; start_time: string; end_time: string }[]).map((r) => [
      r.day_of_week,
      { open: r.open, start_time: r.start_time, end_time: r.end_time },
    ]),
  );
  const locks = (to.data ?? []) as LockRow[];

  // month range to filter locks shown
  const { first, last, days: nDays, startDow } = monthRange(month);
  const monthStart = dayBounds(first).starts_at;
  const monthEndExclusive = dayBounds(nextMonth(month)).starts_at;
  const monthLocks = locks.filter((r) => r.starts_at < monthEndExclusive && r.ends_at > monthStart);

  // per-day lock state for the grid
  const stateFor = (date: string): "full" | "partial" | null => {
    const b = dayBounds(date);
    let kind: "full" | "partial" | null = null;
    for (const r of monthLocks) {
      if (r.starts_at === b.starts_at && r.ends_at === b.ends_at) return "full";
      if (r.starts_at < b.ends_at && r.ends_at > b.starts_at) kind = "partial";
    }
    return kind;
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-16">
      <AdminNav t={t} lang={lang} active="setup" />
      <Flash msg={sp.msg} d={sp.d} t={t} />

      {/* ----- services ----- */}
      <section className="mt-12">
        <h2 className="label">{t.services}</h2>
        <div className="mt-4 flex flex-col gap-4">
          {services.map((s) => (
            <form
              key={s.id}
              action={saveService}
              className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[1fr_1fr_5.5rem_4rem_auto] sm:items-end"
            >
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="month" value={month} />
              <label className="block">
                <span className="label">{t.namePt}</span>
                <input name="name_pt" defaultValue={s.name_pt} required maxLength={80} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="label">{t.nameEn}</span>
                <input name="name_en" defaultValue={s.name_en} required maxLength={80} className="input mt-1.5" />
              </label>
              <label className="block">
                <span className="label">{t.duration}</span>
                <input
                  name="duration_minutes"
                  type="number"
                  min={5}
                  max={600}
                  step={5}
                  defaultValue={s.duration_minutes}
                  required
                  className="input mt-1.5"
                />
              </label>
              <label className="flex items-end gap-2 pb-3 text-sm">
                <input type="checkbox" name="active" defaultChecked={s.active} className="accent-[#2f5240]" />
                {t.active}
              </label>
              <button type="submit" className="btn btn-sm">
                {t.save}
              </button>
            </form>
          ))}
          <form
            action={saveService}
            className="grid grid-cols-2 gap-3 rounded-2xl border border-dashed border-line p-4 sm:grid-cols-[1fr_1fr_5.5rem_4rem_auto] sm:items-end"
          >
            <input type="hidden" name="id" value="" />
            <input type="hidden" name="month" value={month} />
            <label className="block">
              <span className="label">{t.namePt}</span>
              <input name="name_pt" required maxLength={80} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="label">{t.nameEn}</span>
              <input name="name_en" required maxLength={80} className="input mt-1.5" />
            </label>
            <label className="block">
              <span className="label">{t.duration}</span>
              <input name="duration_minutes" type="number" min={5} max={600} step={5} required className="input mt-1.5" />
            </label>
            <label className="flex items-end gap-2 pb-3 text-sm">
              <input type="checkbox" name="active" defaultChecked className="accent-[#2f5240]" />
              {t.active}
            </label>
            <button type="submit" className="btn btn-sm btn-primary">
              {t.addService}
            </button>
          </form>
        </div>
      </section>

      {/* ----- weekly hours ----- */}
      <section className="mt-16">
        <h2 className="label">{t.hours}</h2>
        <form action={saveHours} className="mt-4 rounded-2xl border border-line bg-panel p-4 sm:p-6">
          <input type="hidden" name="month" value={month} />
          <div className="divide-y divide-line">
            {Array.from({ length: 7 }, (_, dow) => {
              const day = hours.get(dow);
              const label = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
                new Date(Date.UTC(2024, 0, 7 + dow, 12)), // 2024-01-07 was a Sunday
              );
              return (
                <div key={dow} className="grid grid-cols-[7.5rem_6.5rem_1fr_1fr] items-center gap-3 py-3 sm:grid-cols-[9rem_6rem_1fr_1fr]">
                  <span className="text-sm">{label}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`open-${dow}`} defaultChecked={day?.open ?? false} className="accent-[#2f5240]" />
                    {t.openDay}
                  </label>
                  <input
                    type="time"
                    name={`start-${dow}`}
                    defaultValue={day?.start_time ?? "09:00"}
                    className="input"
                    aria-label={`start ${label}`}
                  />
                  <input
                    type="time"
                    name={`end-${dow}`}
                    defaultValue={day?.end_time ?? "18:00"}
                    className="input"
                    aria-label={`end ${label}`}
                  />
                </div>
              );
            })}
          </div>
          <button type="submit" className="btn btn-sm btn-primary mt-4">
            {t.saveHours}
          </button>
        </form>
      </section>

      {/* ----- lock calendar ----- */}
      <section className="mt-16">
        <h2 className="label">{t.locks}</h2>
        <div className="mt-5 flex items-center justify-between">
          <Link href={`/gestao/schedule?m=${prevMonth(month)}`} className="text-sm text-soft hover:text-ink">
            ‹ {t.prevM}
          </Link>
          <p className="font-serif text-lg">
            {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
              new Date(`${month}-01T12:00:00Z`),
            )}
          </p>
          <Link href={`/gestao/schedule?m=${nextMonth(month)}`} className="text-sm text-soft hover:text-ink">
            {t.nextM} ›
          </Link>
        </div>

        {/* grid: click a day to block / unblock the whole day */}
        <div className="mt-4 flex flex-wrap justify-center gap-1.5 rounded-2xl border border-line bg-panel px-5 py-6 sm:px-7">
          {Array.from({ length: startDow }).map((_, i) => (
            <span key={`e${i}`} className="h-11 w-11" />
          ))}
          {Array.from({ length: nDays }, (_, i) => {
            const date = `${month}-${pad(i + 1)}`;
            const st = stateFor(date);
            return (
              <form key={date} action={toggleDayLock}>
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="month" value={month} />
                <button
                  type="submit"
                  title={st === "full" ? t.locked : st === "partial" ? t.lockedPartial : undefined}
                  className={
                    "flex h-11 w-11 items-center justify-center rounded-full text-sm transition-colors " +
                    (st === "full"
                      ? "bg-ink text-paper"
                      : st === "partial"
                        ? "text-ink shadow-[inset_0_0_0_1.5px_#2f5240]"
                        : "text-ink hover:bg-paper hover:shadow-[inset_0_0_0_1px_#e8e1d5]")
                  }
                >
                  {i + 1}
                </button>
              </form>
            );
          })}
        </div>
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-soft">
          <span className="inline-block h-3 w-3 rounded-full bg-ink" /> {t.locked}
          <span className="inline-block h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_#2f5240]" /> {t.lockedPartial}
        </p>

        {/* block a partial period */}
        <form action={saveLock} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-6">
          <input type="hidden" name="month" value={month} />
          <label className="block">
            <span className="label">{t.addLock}</span>
            <input type="date" name="date" required className="input mt-1.5" />
          </label>
          <input type="time" name="start" required className="input w-24" aria-label="start" />
          <input type="time" name="end" required className="input w-24" aria-label="end" />
          <button type="submit" className="btn btn-sm btn-primary">
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
                <form action={removeLock}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="month" value={month} />
                  <button type="submit" className="text-sm text-soft underline decoration-line underline-offset-4 hover:text-ink">
                    {t.unlock}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
