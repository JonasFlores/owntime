import { requireAdmin } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { localeOf } from "@/lib/format";
import type { ServiceRow } from "@/lib/booking";
import { saveService, saveHours } from "@/app/gestao/actions";
import { BOOKING_TZ } from "@/lib/tz";
import ActionForm from "@/components/action-form";
import AdminNav from "@/components/admin-nav";
import SetupNotice from "@/components/setup-notice";
import LockCalendar from "@/components/lock-calendar";

const validMonth = (m: string | undefined): string => {
  const q = m ?? "";
  return /^[0-9]{4}-(10|11|12|0[1-9])$/.test(q) ? q
    : new Intl.DateTimeFormat("en-CA", { timeZone: BOOKING_TZ }).format(new Date()).slice(0, 7);
};

export default async function AdminSchedule({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const month = validMonth(sp.m);
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
  // weekdays with no open hours are inactive in the lock calendar
  const closedDows = [0, 1, 2, 3, 4, 5, 6].filter((d) => !hours.get(d)?.open);
  const locks = (to.data ?? []) as { id: string; starts_at: string; ends_at: string; reason: string | null }[];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-16">
      <AdminNav t={t} lang={lang} active="setup" />

      {/* ----- services ----- */}
      <section className="mt-12">
        <h2 className="label">{t.services}</h2>
        <div className="mt-4 flex flex-col gap-4">
          {services.map((s) => (
            <ActionForm
              key={s.id}
              action={saveService}
              lang={lang}
              className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[1fr_1fr_5.5rem_4rem_auto] sm:items-end"
            >
              <input type="hidden" name="id" value={s.id} />
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
            </ActionForm>
          ))}
          <ActionForm
            action={saveService}
            lang={lang}
            className="grid grid-cols-2 gap-3 rounded-2xl border border-dashed border-line p-4 sm:grid-cols-[1fr_1fr_5.5rem_4rem_auto] sm:items-end"
          >
            <input type="hidden" name="id" value="" />
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
          </ActionForm>
        </div>
      </section>

      {/* ----- weekly hours ----- */}
      <section className="mt-16">
        <h2 className="label">{t.hours}</h2>
        <ActionForm action={saveHours} lang={lang} className="mt-4 rounded-2xl border border-line bg-panel p-4 sm:p-6">
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
                    defaultValue={(day?.start_time ?? "09:00").slice(0, 5)}
                    className="input"
                    aria-label={`start ${label}`}
                  />
                  <input
                    type="time"
                    name={`end-${dow}`}
                    defaultValue={(day?.end_time ?? "18:00").slice(0, 5)}
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
        </ActionForm>
      </section>

      {/* ----- lock calendar (client component: weekday header + live month nav) ----- */}
      <section className="mt-16">
        <h2 className="label">{t.locks}</h2>
        <LockCalendar
          lang={lang}
          tz={BOOKING_TZ}
          initialMonth={month}
          initialLocks={locks}
          closedDows={closedDows}
        />
      </section>
    </main>
  );
}
