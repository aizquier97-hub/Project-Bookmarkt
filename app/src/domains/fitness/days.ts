/**
 * Local-calendar day helpers shared by the fitness, streak, and trophy
 * modules. Every metric buckets by the reader's LOCAL day ("did I read
 * today?") rather than UTC, which is what streak apps are judged on.
 */

/** "YYYY-MM-DD" in local time. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Day key for an ISO timestamp, or null when the value does not parse. */
export function dayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dayKey(date);
}

/** Local midnight for a day key. */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function shiftDayKey(key: string, days: number): string {
  return dayKey(addDays(parseDayKey(key), days));
}

/** Whole local days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Every day key from `from` to `to` inclusive, ascending. */
export function dayRange(from: string, to: string): string[] {
  const span = daysBetween(from, to);
  if (span < 0) {
    return [];
  }
  const keys: string[] = [];
  for (let i = 0; i <= span; i++) {
    keys.push(shiftDayKey(from, i));
  }
  return keys;
}

/** The Monday starting the week that contains the given day. */
export function weekStartKey(key: string): string {
  const date = parseDayKey(key);
  const weekday = (date.getDay() + 6) % 7; // Monday = 0
  return dayKey(addDays(date, -weekday));
}
