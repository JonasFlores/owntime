/** Time-string utilities shared by server actions. */

/** Postgres returns TIME as "09:00:00"; HTML time inputs expect "HH:MM". */
export function normTime(v: string): string {
  return v.slice(0, 5);
}

export const isValidHM = (v: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(v);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
};

/** True when an open-window string pair is coherent (end strictly after start). */
export function isCoherentWindow(start: string, end: string): boolean {
  return isValidHM(start) && isValidHM(end) && start < end;
}

/**
 * True when two half-open timestamp ranges overlap. Parse first: Supabase may
 * serialize the same instant as either `+00:00` or `.000Z`, so ISO string
 * comparison is not safe at touching day boundaries.
 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}

/** True when differently-formatted timestamps represent the same instant. */
export function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

export interface AppointmentWindow {
  startDate: string;
  endDate: string;
  start: string;
  end: string;
}

/** Resolve a same-day explicit end or derive it from duration across midnight. */
export function resolveAppointmentWindow(
  date: string,
  start: string,
  end: string,
  durationMinutes?: number,
): AppointmentWindow | null {
  if (!isValidHM(start)) return null;
  if (isCoherentWindow(start, end)) return { startDate: date, endDate: date, start, end };
  if ((end && end !== "00:00") || !durationMinutes || durationMinutes <= 0) return null;

  const [hours, minutes] = start.split(":").map(Number);
  const total = hours * 60 + minutes + durationMinutes;
  const dayOffset = Math.floor(total / 1440);
  const endMinutes = total % 1440;
  const endDate = new Date(`${date}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + dayOffset);

  return {
    startDate: date,
    endDate: endDate.toISOString().slice(0, 10),
    start,
    end: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
  };
}
