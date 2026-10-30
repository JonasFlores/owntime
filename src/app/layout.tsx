import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getLang } from "@/lib/lang";
import { dict } from "@/lib/i18n";
import LanguageSwitcher from "@/components/language-switcher";

export const metadata: Metadata = {
  title: "OWNTIME",
  description: "Agendamento online simples e seguro.",
  applicationName: "OWNTIME",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const t = dict[lang];
  return (
    <html lang={lang}>
      <body className="flex min-h-screen flex-col">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-8 pb-2 sm:px-6">
          <Link href="/" className="font-serif text-lg tracking-wide">
            {t.brand}
          </Link>
          <LanguageSwitcher lang={lang} />
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mx-auto w-full max-w-4xl px-4 pt-16 pb-10 text-xs text-soft sm:px-6">
          © {new Date().getFullYear()} {t.brand} · by{" "}
          <a
            href="https://ownspace.com.br"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line underline-offset-4 hover:text-ink"
          >
            Ownspace.com.br
          </a>
        </footer>
      </body>
    </html>
  );
}
