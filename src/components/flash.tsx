import type { Dict } from "@/lib/i18n";

const map = {
  saved: { key: "msgSaved", warn: false },
  approved: { key: "msgApproved", warn: false },
  locked: { key: "msgLocked", warn: false },
  lockedOff: { key: "msgUnlocked", warn: false },
  unlocked: { key: "msgUnlocked", warn: false },
  declined: { key: "msgDeclined", warn: true },
  err: { key: "msgError", warn: true },
} as const;

/** Flash notice after admin actions, carried via ?msg= (&d= for error details). */
export default function Flash({ msg, d, t }: { msg?: string; d?: string; t: Dict }) {
  if (!msg) return null;
  const def = map[msg as keyof typeof map];
  if (!def) return null;
  return (
    <p
      role="status"
      className={
        "mt-8 flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm " +
        (def.warn
          ? "border-warn/40 bg-warn/5 text-warn"
          : "border-accent/40 bg-accent/5 text-accent")
      }
    >
      {t[def.key]}
      {d && <span className="text-xs opacity-70">{d}</span>}
    </p>
  );
}
