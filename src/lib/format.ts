import type { Lang } from "./i18n";
import { BOOKING_TZ } from "./tz";

export function localeOf(lang: Lang): string {
  return lang === "pt" ? "pt-BR" : "en";
}

/** "2026-05-04" → "Monday, May 4" rendered in the business timezone. */
export function fmtDayDate(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: BOOKING_TZ,
  }).format(new Date(`${date}T12:00:00Z`));
}

export function fmtTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BOOKING_TZ,
  }).format(new Date(iso));
}

/** Short date used in admin lists: dd/mm/yyyy. */
export function fmtShort(iso: string, lang: Lang): string {
  void lang; // dd/mm/yyyy is the requested pattern in both languages
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BOOKING_TZ,
  }).format(new Date(iso));
}
