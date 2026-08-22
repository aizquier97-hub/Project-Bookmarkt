/**
 * Day-grouped timeline for entry lists (J10 / D-026). Journaling apps that
 * handle volume well (Day One, Journey, Apple Journal) all group the stream
 * by day so readers scan headings, not an undifferentiated wall of cards.
 * Deterministic formatting - no locale APIs, so tests behave everywhere.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export interface EntryDayGroup<T> {
  /** Stable key for list rendering, e.g. "2026-08-22" or "undated". */
  key: string;
  /** Human heading: "Today", "Yesterday", "Friday, August 15", or "May 2, 2025". */
  heading: string;
  entries: T[];
}

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Heading for one calendar day, relative to "now" (defaults to today). */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Earlier';
  }
  const dayKey = localDayKey(date);
  if (dayKey === localDayKey(now)) {
    return 'Today';
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey === localDayKey(yesterday)) {
    return 'Yesterday';
  }
  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${WEEKDAYS[date.getDay()]}, ${monthDay}`;
  }
  return `${monthDay}, ${date.getFullYear()}`;
}

/**
 * Groups a newest-first entry stream into contiguous day buckets, preserving
 * order. Entries without a valid timestamp collect under one "Earlier" group.
 */
export function groupEntriesByDay<T extends { created_at: string | null }>(
  rows: T[],
  now: Date = new Date(),
): EntryDayGroup<T>[] {
  const groups: EntryDayGroup<T>[] = [];
  const byKey = new Map<string, EntryDayGroup<T>>();
  for (const row of rows) {
    const date = row.created_at ? new Date(row.created_at) : null;
    const valid = date !== null && !Number.isNaN(date.getTime());
    const key = valid ? localDayKey(date) : 'undated';
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        heading: valid && row.created_at ? formatDayHeading(row.created_at, now) : 'Earlier',
        entries: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(row);
  }
  return groups;
}
