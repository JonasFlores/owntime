import Link from "next/link";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";

export default async function ThanksPage() {
  const lang = await getLang();
  const t = dict[lang];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pt-24 pb-8 sm:px-6 sm:pt-32">
      <p className="label">✓</p>
      <h1 className="mt-4 font-serif text-4xl tracking-tight sm:text-5xl">{t.thanksTitle}</h1>
      <p className="mt-5 max-w-md leading-relaxed text-soft">{t.thanksBody}</p>
      <Link href="/" className="btn mt-10">
        {t.thanksBack}
      </Link>
    </main>
  );
}
