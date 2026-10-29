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
