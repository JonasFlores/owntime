/** Time-string utilities shared by server actions. */

/** Postgres returns TIME as "09:00:00"; HTML time inputs expect "HH:MM". */
export function normTime(v: string): string {
  return v.slice(0, 5);
}

export const isValidHM = (v: string) => /^\d{2}:\d{2}$/.test(v);

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
