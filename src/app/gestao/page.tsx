import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { isConfigured } from "@/lib/supabase";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { fmtShort, fmtTime, localeOf } from "@/lib/format";
import { serviceName, type AppointmentRow } from "@/lib/booking";
import { decide } from "@/app/gestao/actions";
import AdminNav from "@/components/admin-nav";
import Flash from "@/components/flash";
import SetupNotice from "@/components/setup-notice";

export default async function AdminBookings({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; d?: string }>;
}) {
  const sp = await searchParams;
  const lang = await getLang();
  const t = dict[lang];
  const locale = localeOf(lang);
  const nowIso = new Date().toISOString();

  if (!isConfigured)
    return (
      <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-8">
        <AdminNav t={t} lang={lang} active="bookings" />
        <Flash msg={sp.msg} d={sp.d} t={t} />
        <h1 className="mt-10 font-serif text-3xl">{t.tabBookings}</h1>
        <SetupNotice />
      </main>
    );

  const { sb } = await requireAdmin();
  const cols = "*, services(name_pt,name_en,duration_minutes)";
  const [p, a, h] = await Promise.all([
    sb.from("appointments").select(cols).eq("status", "pending").order("starts_at").limit(60),
    sb.from("appointments").select(cols).eq("status", "approved").gte("ends_at", nowIso).order("starts_at").limit(60),
    sb.from("appointments").select(cols).in("status", ["rejected", "cancelled"]).order("starts_at", { ascending: false }).limit(20),
  ]);
  const pending = (p.data ?? []) as unknown as AppointmentRow[];
  const approved = (a.data ?? []) as unknown as AppointmentRow[];
  const history = (h.data ?? []) as unknown as AppointmentRow[];

  const Row = ({ x, actions }: { x: AppointmentRow; actions: boolean }) => (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-serif text-lg">
          {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: process.env.APPOINTMENT_TIMEZONE }).format(new Date(x.starts_at))}
          <span className="text-soft"> · </span>
          {fmtTime(x.starts_at, lang)}–{fmtTime(x.ends_at, lang)}
        </p>
        <p className="label">
          {x.services ? serviceName(x.services, lang) : "—"} · {x.services?.duration_minutes ?? "?"} {t.minutes}
        </p>
      </div>
      <p className="mt-1 text-sm">
        {x.guest_name}
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
      {x.note && <p className="mt-1 text-sm italic text-soft">“{x.note}”</p>}
      <p className="mt-2 text-xs text-soft/70">
        {t.createdLbl} {fmtShort(x.created_at, lang)} {new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: process.env.APPOINTMENT_TIMEZONE }).format(new Date(x.created_at))}
      </p>
      {actions && (
        <div className="mt-3 flex gap-2">
          <form action={decide}>
            <input type="hidden" name="id" value={x.id} />
            <input type="hidden" name="status" value="approved" />
            <button type="submit" className="btn btn-sm btn-primary">
              {t.approve}
            </button>
          </form>
          <form action={decide}>
            <input type="hidden" name="id" value={x.id} />
            <input type="hidden" name="status" value="rejected" />
            <button type="submit" className="btn btn-sm">
              {t.reject}
            </button>
          </form>
        </div>
      )}
    </li>
  );

  const Section = ({ title, list, actions }: { title: string; list: AppointmentRow[]; actions: boolean }) => (
    <section className="mt-12">
      <h2 className="label">{title}</h2>
      {list.length === 0 ? (
        <p className="mt-4 text-sm text-soft">{t.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {list.map((x) => (
            <Row key={x.id} x={x} actions={actions} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-8">
      <AdminNav t={t} lang={lang} active="bookings" />
      <Flash msg={sp.msg} d={sp.d} t={t} />
      <Section title={t.pending} list={pending} actions />
      <Section title={t.approvedUp} list={approved} actions={false} />
      <Section title={t.history} list={history} actions={false} />
    </main>
  );
}
