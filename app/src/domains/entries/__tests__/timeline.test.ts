import { formatDayHeading, groupEntriesByDay } from '@/domains/entries/timeline';

// Fixed "now": Saturday, August 22, 2026, noon local time.
const NOW = new Date(2026, 7, 22, 12, 0, 0);

const iso = (
  year: number,
  monthIndex: number,
  day: number,
  hour = 9,
): string => new Date(year, monthIndex, day, hour).toISOString();

describe('formatDayHeading', () => {
  it('labels the current day Today', () => {
    expect(formatDayHeading(iso(2026, 7, 22), NOW)).toBe('Today');
  });

  it('labels the previous day Yesterday', () => {
    expect(formatDayHeading(iso(2026, 7, 21), NOW)).toBe('Yesterday');
  });

  it('uses weekday and month-day within the same year', () => {
    // August 15, 2026 is a Saturday.
    expect(formatDayHeading(iso(2026, 7, 15), NOW)).toBe('Saturday, August 15');
  });

  it('adds the year for other years', () => {
    expect(formatDayHeading(iso(2025, 4, 2), NOW)).toBe('May 2, 2025');
  });

  it('falls back to Earlier for invalid timestamps', () => {
    expect(formatDayHeading('not-a-date', NOW)).toBe('Earlier');
  });
});

describe('groupEntriesByDay', () => {
  it('buckets a newest-first stream by calendar day, preserving order', () => {
    const rows = [
      { id: 1, created_at: iso(2026, 7, 22, 11) },
      { id: 2, created_at: iso(2026, 7, 22, 8) },
      { id: 3, created_at: iso(2026, 7, 21, 22) },
      { id: 4, created_at: iso(2026, 7, 15, 10) },
    ];
    const groups = groupEntriesByDay(rows, NOW);
    expect(groups.map((group) => group.heading)).toEqual([
      'Today',
      'Yesterday',
      'Saturday, August 15',
    ]);
    expect(groups[0].entries.map((row) => row.id)).toEqual([1, 2]);
    expect(groups[1].entries.map((row) => row.id)).toEqual([3]);
    expect(groups[2].entries.map((row) => row.id)).toEqual([4]);
  });

  it('collects entries without timestamps under one Earlier group', () => {
    const rows = [
      { id: 1, created_at: iso(2026, 7, 22) },
      { id: 2, created_at: null },
      { id: 3, created_at: null },
    ];
    const groups = groupEntriesByDay(rows, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[1].key).toBe('undated');
    expect(groups[1].heading).toBe('Earlier');
    expect(groups[1].entries.map((row) => row.id)).toEqual([2, 3]);
  });

  it('returns no groups for an empty stream', () => {
    expect(groupEntriesByDay([], NOW)).toEqual([]);
  });
});
