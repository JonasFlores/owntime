import { isConfigured } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { BOOKING_TZ } from "@/lib/tz";
import AdminNav from "@/components/admin-nav";
import SetupNotice from "@/components/setup-notice";
import BookingsCalendar from "@/components/bookings-calendar";

/** The main dashboard: month calendar + day panel (client-side, no reloads). */
export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const initialMonth = /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? (sp.m as string) : undefined;
  const lang = await getLang();
  const t = dict[lang];

  if (!isConfigured)
    return (
      <main className="mx-auto w-full max-w-2xl px-6 pt-12 pb-8">
        <AdminNav t={t} lang={lang} active="bookings" />
        <h1 className="mt-10 font-serif text-3xl">{t.tabBookings}</h1>
        <SetupNotice />
      </main>
    );

  const { sb } = await requireAdmin(); // redirect anonymous visitors before any calendar renders
  const { data: hours } = await sb.from("working_hours").select("day_of_week,open");
  const openDows = new Set((hours ?? []).filter((x) => x.open).map((x) => x.day_of_week));
  const closedDows = [0, 1, 2, 3, 4, 5, 6].filter((dow) => !openDows.has(dow));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 pt-12 pb-16">
      <AdminNav t={t} lang={lang} active="bookings" />
      <BookingsCalendar lang={lang} tz={BOOKING_TZ} initialMonth={initialMonth} closedDows={closedDows} />
    </main>
  );
}
