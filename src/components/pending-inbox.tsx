import Link from "next/link";
import { decide } from "@/app/gestao/actions";
import { fmtShort, fmtTime } from "@/lib/format";
import { serviceName, type AppointmentRow } from "@/lib/booking";
import type { Dict, Lang } from "@/lib/i18n";
import ActionForm from "@/components/action-form";
import SubmitButton from "@/components/submit-button";

function monthOf(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    timeZone: tz,
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

/** Focused inbox for requests that still need an admin decision. */
export default function PendingInbox({
  items,
  lang,
  t,
  tz,
}: {
  items: AppointmentRow[];
  lang: Lang;
  t: Dict;
  tz: string;
}) {
  return (
    <section className="mt-10">
      <div className="max-w-2xl">
        <h1 className="font-serif text-3xl tracking-tight">{t.pending}</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">{t.pendingHelp}</p>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-line bg-panel p-6 text-sm text-soft">{t.empty}</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {items.map((x) => (
            <li key={x.id} className="py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-serif text-xl">
                      {fmtShort(x.starts_at, lang)} · {fmtTime(x.starts_at, lang)}–{fmtTime(x.ends_at, lang)}
                    </p>
                    <span className="rounded-full border border-dashed border-warn/70 px-2.5 py-0.5 text-xs text-warn">
                      {t.stPending}
                    </span>
                  </div>
                  <p className="mt-2 font-medium">{x.guest_name}</p>
                  <p className="mt-1 text-sm text-soft">
                    {x.services ? serviceName(x.services, lang) : "—"}
                    <span> · </span>
                    <a href={`tel:${x.guest_phone}`} className="text-ink underline decoration-line underline-offset-4">
                      {x.guest_phone}
                    </a>
                    {x.guest_email && (
                      <>
                        <span> · </span>
                        <a href={`mailto:${x.guest_email}`} className="text-ink underline decoration-line underline-offset-4">
                          {x.guest_email}
                        </a>
                      </>
                    )}
                  </p>
                  {x.note && <p className="mt-2 text-sm italic text-soft">“{x.note}”</p>}
                  <Link
                    href={`/gestao?m=${monthOf(x.starts_at, tz)}`}
                    className="mt-3 inline-block text-sm text-soft underline decoration-line underline-offset-4 hover:text-ink"
                  >
                    {t.openCalendar}
                  </Link>
                </div>

                <div className="flex shrink-0 gap-2">
                  <ActionForm action={decide} lang={lang} className="inline-flex" hideSuccess>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="status" value="approved" />
                    <SubmitButton className="btn btn-sm btn-primary">{t.approve}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={decide} lang={lang} className="inline-flex" hideSuccess>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <SubmitButton className="btn btn-sm">{t.reject}</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
