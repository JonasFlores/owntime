import { isConfigured } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { BOOKING_TZ } from "@/lib/tz";
import type { AppointmentRow } from "@/lib/booking";
import AdminNav from "@/components/admin-nav";
import SetupNotice from "@/components/setup-notice";
import BookingsCalendar from "@/components/bookings-calendar";
import PendingInbox from "@/components/pending-inbox";

/** The main dashboard: month calendar + day panel (client-side, no reloads). */
export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ m?: string; view?: string }> }) {
  const sp = await searchParams;
  const pendingView = sp.view === "pending";
  const initialMonth = /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? "") ? (sp.m as string) : undefined;
  const lang = await getLang();
  const t = dict[lang];

  if (!isConfigured)
    return (
      <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-8 sm:px-6">
        <AdminNav t={t} lang={lang} active={pendingView ? "pending" : "bookings"} />
        <h1 className="mt-10 font-serif text-3xl">{t.tabBookings}</h1>
        <SetupNotice />
      </main>
    );

  const { sb } = await requireAdmin(); // redirect anonymous visitors before any calendar renders
  const cols = "*, services(name_pt,name_en,duration_minutes)";
  const [hoursResult, pendingResult] = await Promise.all([
    sb.from("working_hours").select("day_of_week,open"),
    sb.from("appointments").select(cols, { count: "exact" }).eq("status", "pending").order("starts_at").limit(100),
  ]);
  const hours = hoursResult.data;
  const pending = (pendingResult.data ?? []) as unknown as AppointmentRow[];
  const pendingCount = pendingResult.count ?? pending.length;
  const openDows = new Set((hours ?? []).filter((x) => x.open).map((x) => x.day_of_week));
  const closedDows = [0, 1, 2, 3, 4, 5, 6].filter((dow) => !openDows.has(dow));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-12 pb-16 sm:px-6">
      <AdminNav t={t} lang={lang} active={pendingView ? "pending" : "bookings"} pendingCount={pendingCount} />
      {pendingView ? (
        <PendingInbox items={pending} lang={lang} t={t} tz={BOOKING_TZ} />
      ) : (
        <BookingsCalendar lang={lang} tz={BOOKING_TZ} initialMonth={initialMonth} closedDows={closedDows} />
      )}
    </main>
  );
}
