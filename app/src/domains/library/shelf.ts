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

export interface ShelfTitleTypography {
  fontSize: number;
  lineHeight: number;
  maxLines: number;
}

/**
 * Book-cover typography, matching what Kindle/Apple Books do on generated
 * covers: titles wrap at spaces, never mid-word. The longest word sets the
 * type size, stepping down only within readable bounds (NN/g: don't shrink
 * below glanceable sizes). A single word too long even at the smallest step
 * stays on one line and ellipsizes - truncation is the last resort, not the
 * default, because it hides the book's identity.
 */
export function shelfTitleTypography(title: string): ShelfTitleTypography {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  if (longest <= 12) {
    return { fontSize: 15, lineHeight: 20, maxLines: 3 };
  }
  if (longest <= 15) {
    return { fontSize: 13, lineHeight: 17, maxLines: 3 };
  }
  if (longest <= 18) {
    return { fontSize: 11, lineHeight: 15, maxLines: 3 };
  }
  return { fontSize: 11, lineHeight: 15, maxLines: words.length === 1 ? 1 : 3 };
}
