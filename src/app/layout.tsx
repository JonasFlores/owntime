import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Estúdio · Agenda",
  description: "Faça sua reserva online — choose a time, we confirm it.",
};

/** Plain <a> so middleware can intercept ?lang= and set the cookie. */
function LangLink({ target, cur, children }: { target: "pt" | "en"; cur: string; children: string }) {
  return (
    <a
      href={`?lang=${target}`}
      aria-current={cur === target ? "true" : undefined}
      className={
        cur === target ? "font-medium text-ink underline-offset-4" : "text-soft hover:text-ink"
      }
    >
      {children}
    </a>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const t = dict[lang];
  return (
    <html lang={lang}>
      <body className="flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 pt-8 pb-2">
          <Link href="/" className="font-serif text-lg tracking-wide">
            {t.brand}
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label="Language">
            <LangLink target="pt" cur={lang}>PT</LangLink>
            <span className="text-line">·</span>
            <LangLink target="en" cur={lang}>EN</LangLink>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mx-auto w-full max-w-2xl px-6 pt-16 pb-10 text-[13px] text-soft">
          © {new Date().getFullYear()} ·{" "}
          <Link href="/admin/login" className="underline decoration-line underline-offset-4 hover:text-ink">
            admin
          </Link>
        </footer>
      </body>
    </html>
  );
}
