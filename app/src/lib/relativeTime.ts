const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Warm, low-precision relative timestamps for the re-entry moment
 * ("You were here - 3 weeks ago"). Returns null for missing/invalid dates.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) {
    return null;
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return null;
  }
  const elapsed = now.getTime() - then;
  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (elapsed < 2 * DAY) {
    return 'yesterday';
  }
  if (elapsed < WEEK) {
    return `${Math.floor(elapsed / DAY)} days ago`;
  }
  if (elapsed < MONTH) {
    const weeks = Math.floor(elapsed / WEEK);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (elapsed < YEAR) {
    const months = Math.floor(elapsed / MONTH);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(elapsed / YEAR);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
