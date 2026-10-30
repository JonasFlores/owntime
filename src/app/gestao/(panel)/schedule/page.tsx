import { requireAdmin } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { localeOf } from "@/lib/format";
import type { ServiceRow } from "@/lib/booking";
import { SERVICE_GRID } from "@/lib/service-grid";
import { saveService, saveHours, deleteService } from "@/app/gestao/actions";
import ActionForm from "@/components/action-form";
import ConfirmDelete from "@/components/confirm-delete";
import ServicesFilter from "@/components/services-filter";
import SubmitButton from "@/components/submit-button";
import SetupNotice from "@/components/setup-notice";

const emptyUsage = { upcoming: 0, pending: 0, history: 0, total: 0 };

export default async function AdminSchedule({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lang = await getLang();
  const t = dict[lang];
  const locale = localeOf(lang);
  const sp = await searchParams;
  const initialShow = sp.show === "active" || sp.show === "inactive" ? sp.show : "all";

  if (!isConfigured)
    return (
      <>
        <h1 className="mt-10 font-serif text-3xl">{t.tabSetup}</h1>
        <SetupNotice />
      </>
    );

  const { sb } = await requireAdmin();
  const [svc, wh, usageResult] = await Promise.all([
    sb.from("services").select("*"),
    sb.from("working_hours").select("*").order("day_of_week"),
    sb.rpc("service_booking_usage"),
  ]);
  const services = (svc.data ?? []) as unknown as ServiceRow[];

  // A–Z by service name (PT first, EN as tiebreaker) instead of sort_order.
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const sorted = [...services].sort(
    (a, b) => collator.compare(a.name_pt, b.name_pt) || collator.compare(a.name_en, b.name_en),
  );

  // Aggregated in Postgres: setup cost stays constant as booking history grows.
  const usage = new Map<string, { upcoming: number; pending: number; history: number; total: number }>(
    ((usageResult.data ?? []) as Array<{ service_id: string; upcoming: number; pending: number; history: number; total: number }>).map(
      (row) => [row.service_id, {
        upcoming: Number(row.upcoming),
        pending: Number(row.pending),
        history: Number(row.history),
        total: Number(row.total),
      }],
    ),
  );

  const counts = {
    all: services.length,
    active: services.filter((s) => s.active).length,
    inactive: services.filter((s) => !s.active).length,
  };
  const hours = new Map<number, { open: boolean; start_time: string; end_time: string }>(
    ((wh.data ?? []) as { day_of_week: number; open: boolean; start_time: string; end_time: string }[]).map((r) => [
      r.day_of_week,
      { open: r.open, start_time: r.start_time, end_time: r.end_time },
    ]),
  );

  /* destructive delete summary passed to the two-step confirm */
  const deleteDetail = (s: ServiceRow) => {
    const u = usage.get(s.id) ?? emptyUsage;
    if (lang === "pt")
      return `${u.upcoming} futuros · ${u.pending} pendentes · ${u.history} antigos`;
    return `${u.upcoming} upcoming · ${u.pending} pending · ${u.history} past`;
  };

  /* one ready-made table row per service, reused by both filter groups */
  const serviceRow = (s: ServiceRow) => {
    const u = usage.get(s.id) ?? emptyUsage;
    return (
      <div key={s.id} className={`${SERVICE_GRID} px-4 py-3 lg:py-2.5`}>
        <ActionForm
          action={saveService}
          lang={lang}
          className="contents"
          messageClassName="col-span-full"
          hideSuccess
        >
          <input type="hidden" name="id" value={s.id} />
          <label className="block">
            <span className="label lg:hidden">{t.namePt}</span>
            <input name="name_pt" defaultValue={s.name_pt} required maxLength={80} className="input mt-1.5 lg:mt-0" />
          </label>
          <label className="block">
            <span className="label lg:hidden">{t.nameEn}</span>
            <input name="name_en" defaultValue={s.name_en} required maxLength={80} className="input mt-1.5 lg:mt-0" />
          </label>
          <label className="block">
            <span className="label lg:hidden">{t.duration}</span>
            <input
              name="duration_minutes"
              type="number"
              min={5}
              max={600}
              step={5}
              defaultValue={s.duration_minutes}
              required
              aria-label={t.duration}
              className="input mt-1.5 lg:mt-0"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={s.active} className="accent-[#2f5240]" />
            <span className={s.active ? "text-accent" : "text-soft"}>{t.active}</span>
          </label>
          <div className="text-sm text-soft" title={t.bookings}>
            <span className="label mr-1.5 lg:hidden">{t.bookings}</span>
            {u.total}
            {u.pending > 0 && (
              <span className="ml-2 text-xs text-warn">
                {u.pending} · {t.stPending}
              </span>
            )}
          </div>
          <SubmitButton className="btn btn-sm">{t.save}</SubmitButton>
        </ActionForm>
        <ConfirmDelete action={deleteService} lang={lang} id={s.id} detail={deleteDetail(s)} />
      </div>
    );
  };

  return (
    <>
      {/* ----- services ----- */}
      <section className="mt-12">
        <ServicesFilter
          lang={lang}
          initialShow={initialShow}
          counts={counts}
          activeRows={sorted.filter((s) => s.active).map(serviceRow)}
          inactiveRows={sorted.filter((s) => !s.active).map(serviceRow)}
        />

        {/* new service — same grid, dashed frame to signal "empty row" */}
        <div className={`${SERVICE_GRID} mt-3 rounded-2xl border border-dashed border-line p-4`}>
          <ActionForm action={saveService} lang={lang} className="contents" messageClassName="col-span-full">
            <input type="hidden" name="id" value="" />
            <label className="block">
              <span className="label lg:hidden">{t.namePt}</span>
              <input name="name_pt" required maxLength={80} className="input mt-1.5 lg:mt-0" />
            </label>
            <label className="block">
              <span className="label lg:hidden">{t.nameEn}</span>
              <input name="name_en" required maxLength={80} className="input mt-1.5 lg:mt-0" />
            </label>
            <label className="block">
              <span className="label lg:hidden">{t.duration}</span>
              <input
                name="duration_minutes"
                type="number"
                min={5}
                max={600}
                step={5}
                required
                className="input mt-1.5 lg:mt-0"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked className="accent-[#2f5240]" />
              {t.active}
            </label>
            <span />
            <SubmitButton className="btn btn-sm btn-primary">{t.addService}</SubmitButton>
          </ActionForm>
          {/* delete column spacer keeps the add row aligned with the table */}
          <div />
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
                <div key={dow} className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[9rem_6rem_1fr_1fr]">
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
          <SubmitButton className="btn btn-sm btn-primary mt-4">{t.saveHours}</SubmitButton>
        </ActionForm>
      </section>

    </>
  );
}
