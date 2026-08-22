import { formatRelativeTime } from '@/lib/relativeTime';

const NOW = new Date('2026-08-22T12:00:00Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('formatRelativeTime', () => {
  it('handles missing and invalid dates', () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime(undefined, NOW)).toBeNull();
    expect(formatRelativeTime('not-a-date', NOW)).toBeNull();
  });

  it('formats sub-hour times', () => {
    expect(formatRelativeTime(ago(10_000), NOW)).toBe('just now');
    expect(formatRelativeTime(ago(60_000), NOW)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(45 * 60_000), NOW)).toBe('45 minutes ago');
  });

  it('formats hours and days', () => {
    expect(formatRelativeTime(ago(3_600_000), NOW)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(9 * 3_600_000), NOW)).toBe('9 hours ago');
    expect(formatRelativeTime(ago(30 * 3_600_000), NOW)).toBe('yesterday');
    expect(formatRelativeTime(ago(3 * 86_400_000), NOW)).toBe('3 days ago');
  });

  it('formats weeks, months, and years', () => {
    expect(formatRelativeTime(ago(7 * 86_400_000), NOW)).toBe('1 week ago');
    expect(formatRelativeTime(ago(21 * 86_400_000), NOW)).toBe('3 weeks ago');
    expect(formatRelativeTime(ago(31 * 86_400_000), NOW)).toBe('1 month ago');
    expect(formatRelativeTime(ago(200 * 86_400_000), NOW)).toBe('6 months ago');
    expect(formatRelativeTime(ago(400 * 86_400_000), NOW)).toBe('1 year ago');
  });
});
