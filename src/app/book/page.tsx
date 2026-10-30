import Link from "next/link";
import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { getServices, serviceName } from "@/lib/booking";
import { isConfigured } from "@/lib/supabase";
import BookingFlow from "@/components/booking-flow";
import { currentMonthInTz } from "@/lib/tz";

export const metadata: Metadata = { title: "Owntime" };

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const sp = await searchParams;
  const lang = await getLang();
  const t = dict[lang];
  const services = await getServices();
  const s = sp.service ? services.find((x) => x.id === sp.service) : undefined;
  const initialMonth = currentMonthInTz();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-10 pb-8 sm:px-6">
      <Link href="/" className="text-sm text-soft hover:text-ink">
        ← {t.back}
      </Link>

      {!s ? (
        <>
          <p className="label mt-10">{t.chooseService}</p>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {services.map((x) => (
              <li key={x.id}>
                <Link href={`/book?service=${x.id}`} className="flex items-baseline justify-between gap-3 py-4">
                  <span className="min-w-0 font-serif text-lg">{serviceName(x, lang)}</span>
                  <span className="label shrink-0">{x.duration_minutes} {t.minutes}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h1 className="mt-6 font-serif text-3xl tracking-tight sm:text-4xl">
            {serviceName(s, lang)}
          </h1>
          <p className="label mt-3">
            {s.duration_minutes} {t.minutes}
          </p>
          {isConfigured ? (
            <BookingFlow
              service={{ id: s.id, name: serviceName(s, lang), duration: s.duration_minutes }}
              lang={lang}
              initialMonth={initialMonth}
            />
          ) : (
            <p className="mt-10 rounded-xl border border-line bg-panel px-5 py-4 text-sm text-soft">
              {t.setupHint}
            </p>
          )}
        </>
      )}
    </main>
  );
}
