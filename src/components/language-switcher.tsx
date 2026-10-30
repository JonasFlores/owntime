"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { setLanguage } from "@/app/language-actions";

export default function LanguageSwitcher({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (next: Lang) => {
    if (next === lang) return;
    startTransition(async () => {
      await setLanguage(next);
      router.refresh();
    });
  };

  return (
    <nav className="flex items-center gap-2 text-sm" aria-label="Language">
      {(["pt", "en"] as const).map((item, index) => (
        <span key={item} className="contents">
          {index > 0 && <span className="text-line">·</span>}
          <button
            type="button"
            onClick={() => select(item)}
            disabled={pending}
            aria-current={lang === item ? "true" : undefined}
            className={
              lang === item
                ? "cursor-pointer font-medium text-ink underline-offset-4"
                : "cursor-pointer text-soft hover:text-ink disabled:cursor-wait"
            }
          >
            {item.toUpperCase()}
          </button>
        </span>
      ))}
    </nav>
  );
}
