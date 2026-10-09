/**
 * Where a QR bookmark scan lands (D-086), from the lookup's resolved state.
 * Pure so the funnel classifier is testable without the screen. The code
 * itself is never part of the signal.
 */

export type BookmarkScanOutcome =
  | 'error'
  | 'unregistered'
  | 'unclaimed'
  | 'unlinked'
  | 'opened_book';

export function bookmarkScanOutcome(input: {
  pending: boolean;
  error: boolean;
  bookmark: { user_id: string | null; topic_id: number | null } | null;
}): BookmarkScanOutcome | null {
  if (input.pending) {
    return null;
  }
  if (input.error) {
    return 'error';
  }
  if (!input.bookmark) {
    return 'unregistered';
  }
  if (input.bookmark.user_id === null) {
    return 'unclaimed';
  }
  return input.bookmark.topic_id === null ? 'unlinked' : 'opened_book';
}
