import Link from "next/link";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import { getServices, serviceName } from "@/lib/booking";
import { isConfigured } from "@/lib/supabase";

export default async function Home() {
  const lang = await getLang();
  const t = dict[lang];
  const services = await getServices();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-16 pb-8 sm:pt-24">
      <p className="label">{t.homeEyebrow}</p>
      <h1 className="mt-4 font-serif text-4xl leading-[1.12] tracking-tight sm:text-5xl">
        {t.homeTitle}
      </h1>
      <p className="mt-5 max-w-md leading-relaxed text-soft">{t.homeIntro}</p>

      {isConfigured ? (
        <ul className="mt-14 divide-y divide-line border-y border-line">
          {services.length === 0 && (
            <li className="py-6 text-sm text-soft">{t.empty}</li>
          )}
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={`/book?service=${s.id}`}
                className="group flex items-baseline justify-between py-5"
              >
                <span className="font-serif text-xl transition-colors group-hover:text-accent sm:text-2xl">
                  {serviceName(s, lang)}
                </span>
                <span className="label shrink-0 pl-4 transition-colors group-hover:text-accent">
                  {s.duration_minutes} {t.minutes}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-14 rounded-xl border border-line bg-panel px-5 py-4 text-sm text-soft">
          {t.setupHint}
        </p>
      )}
    </main>
  );
}
