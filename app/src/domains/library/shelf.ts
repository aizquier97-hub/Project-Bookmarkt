import type { BookPositionSummary } from '@/domains/entries/display';
import type { ProgressBoundary } from '@/domains/entries/progress';
import type { Book } from '@/domains/library/service';

/**
 * Percent of the book read, for the cover's progress bar. Finished books are
 * always 100. Otherwise computable only from a page-type position plus a
 * known page count (chapters don't convert). Clamped to 0-100.
 */
export function computeCompletionPercent(
  position: ProgressBoundary | null | undefined,
  totalPages: number | null | undefined,
  finished: boolean,
): number | null {
  if (finished) {
    return 100;
  }
  if (!position || position.progressType !== 'page') {
    return null;
  }
  const total = typeof totalPages === 'number' && totalPages > 0 ? totalPages : null;
  if (!total) {
    return null;
  }
  const pct = Math.round((position.upper / total) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Shelf order (J4, research-backed): active books sort by last-entry recency
 * so the freshest read takes the top-left slot; books never touched follow by
 * newest-added; finished books settle onto the bottom shelves, most recently
 * finished first. ISO timestamps compare lexicographically.
 */
export function sortBooksForShelf(
  books: Book[],
  summaries: Map<number, BookPositionSummary>,
): Book[] {
  return [...books].sort((a, b) => {
    const aFinished = a.finished_at ? 1 : 0;
    const bFinished = b.finished_at ? 1 : 0;
    if (aFinished !== bFinished) {
      return aFinished - bFinished;
    }
    if (aFinished && bFinished) {
      return String(b.finished_at).localeCompare(String(a.finished_at));
    }
    const aLast = summaries.get(a.id)?.lastEntryAt ?? '';
    const bLast = summaries.get(b.id)?.lastEntryAt ?? '';
    if (aLast !== bLast) {
      return bLast.localeCompare(aLast);
    }
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
}
