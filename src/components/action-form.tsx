"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { dict, type Lang } from "@/lib/i18n";
import type { AdminResult } from "@/app/gestao/actions";

const KEY: Record<string, "msgSaved" | "msgApproved" | "msgDeclined" | "msgLocked" | "msgUnlocked" | "msgDeleted"> = {
  saved: "msgSaved",
  approved: "msgApproved",
  declined: "msgDeclined",
  rejected: "msgDeclined",
  locked: "msgLocked",
  unlocked: "msgUnlocked",
  deleted: "msgDeleted",
};

/**
 * Form wrapper for admin server actions: no page reload — the action returns
 * a state, the page refreshes its server data in place (router.refresh),
 * and a small inline message confirms (green) or explains the failure (red).
 */
export default function ActionForm({
  action,
  lang,
  className,
  hideSuccess = false,
  messageClassName = "",
  children,
}: {
  action: (prev: AdminResult | null, fd: FormData) => Promise<AdminResult>;
  lang: Lang;
  className?: string;
  hideSuccess?: boolean;
  /** extra classes for the inline message, e.g. col-span-full inside grids */
  messageClassName?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const t = dict[lang];

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const text = state
    ? state.ok
      ? t[KEY[state.code ?? ""] ?? "msgSaved"]
      : t.msgError
    : null;

  return (
    <form action={formAction} aria-busy={pending || undefined} className={className}>
      {children}
      {state && !(hideSuccess && state.ok) && (
        <p
          role="status"
          className={
            "mt-3 flex flex-col gap-0.5 text-sm " +
            (state.ok ? "text-accent" : "text-warn") +
            (messageClassName ? ` ${messageClassName}` : "")
          }
        >
          {text}
          {!state.ok && state.detail && <span className="text-xs opacity-70">{state.detail}</span>}
        </p>
      )}
    </form>
  );
}
