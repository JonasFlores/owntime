"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dict, type Lang } from "@/lib/i18n";
import type { AdminResult } from "@/app/gestao/actions";
import Spinner from "@/components/spinner";

/**
 * Danger action with a two-step confirm. The first click only opens a small
 * popover explaining what else the destructive action removes; the request
 * itself runs on the explicit confirm. The server action is invoked directly
 * (no <form>), so this can sit next to another form in the same table row.
 * Errors stay inside the popover; success shows a short toast-like message.
 */
export default function ConfirmDelete({
  action,
  lang,
  id,
  detail,
}: {
  action: (prev: AdminResult | null, fd: FormData) => Promise<AdminResult>;
  lang: Lang;
  id: string;
  /** Ad-hoc impact summary, e.g. "2 upcoming · 0 pending · 14 past" */
  detail: string;
}) {
  const t = dict[lang];
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminResult | null>(null);

  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  const confirm = () => {
    const fd = new FormData();
    fd.set("id", id);
    setBusy(true);
    action(null, fd)
      .then((res) => {
        setResult(res);
        if (res.ok) setArmed(false);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="relative h-9">
      <button
        type="button"
        aria-expanded={armed}
        disabled={busy}
        onClick={() => {
          setArmed(true);
          setResult(null);
        }}
        className="inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-warn/40 px-4 text-[13px] font-medium text-warn transition-colors hover:border-warn hover:bg-warn hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t.delete}
      </button>

      {armed && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-panel p-4 shadow-lg">
          <p className="text-sm font-medium text-warn">{t.deleteAsk}</p>
          <p className="mt-1 text-xs text-soft">{detail}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              aria-busy={busy || undefined}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-warn bg-warn px-4 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Spinner className="h-3 w-3" />}
              {busy ? t.deleteBusy : t.deleteGo}
            </button>
            <button type="button" disabled={busy} onClick={() => setArmed(false)} className="btn btn-sm">
              {t.cancel}
            </button>
          </div>
          {result && !result.ok && (
            <p role="alert" className="mt-2 text-xs text-warn">
              {t.msgError}
              {result.detail && (
                <span className="mt-0.5 block opacity-70">{result.detail}</span>
              )}
            </p>
          )}
        </div>
      )}

      {result?.ok && (
        <p role="status" className="absolute top-full mt-1 whitespace-nowrap text-xs text-accent">
          {t.msgDeleted}
        </p>
      )}
    </div>
  );
}
