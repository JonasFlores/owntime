import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Fixed business timezone (IANA name) — the single source of truth for calendar math. */
export const BOOKING_TZ = process.env.APPOINTMENT_TIMEZONE || "America/Sao_Paulo";

export function currentMonthInTz(tz: string = BOOKING_TZ): string {
  return dayjs().tz(tz).format("YYYY-MM");
}

/** Convert a business-local date (and optional time) to a UTC ISO string. */
export function atTz(date: string, time = "00:00:00", tz: string = BOOKING_TZ): string {
  return dayjs.tz(`${date} ${time}`, tz).toISOString();
}

/** Bounds of a full business-local day: millisecond range [day, nextDay). */
export function dayBounds(date: string, tz: string = BOOKING_TZ): { starts_at: string; ends_at: string } {
  const d = dayjs.tz(`${date} 00:00:00`, tz);
  return { starts_at: d.toISOString(), ends_at: d.add(1, "day").toISOString() };
}

/** Month layout for "YYYY-MM": first/last date strings, day count, weekday of the 1st (0=Sun). */
export function monthRange(month: string): { first: string; last: string; days: number; startDow: number } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = `${month}-01`;
  const last = `${month}-${String(days).padStart(2, "0")}`;
  const startDow = dayjs.utc(`${month}-01`).day();
  return { first, last, days, startDow };
}

/** "2026-03" moved by n months, crossing year boundaries. */
export function shiftMonth(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  const z = mo + n;
  return z < 1 ? `${y - 1}-12` : z > 12 ? `${y + 1}-01` : `${y}-${String(z).padStart(2, "0")}`;
}
