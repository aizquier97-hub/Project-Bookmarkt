/**
 * Knowledge-based difficulty estimates (D-063). The book-difficulty Edge
 * Function rates a book once and caches the result on its topic row; this
 * module asks for the rating and backfills books that do not have one yet.
 *
 * Backfill is deliberately gentle: a few books per launch, one at a time,
 * each book attempted once per launch so a provider outage never loops.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Book } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';

export interface DifficultyEstimate {
  difficulty: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
  cached: boolean;
}

/** Books estimated per app launch (the server also caps per user per day). */
export const BACKFILL_PER_LAUNCH = 8;

export async function requestDifficultyEstimate(bookId: number): Promise<DifficultyEstimate> {
  const { data, error } = await supabase.functions.invoke('book-difficulty', {
    body: { bookId },
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    let message = 'The difficulty could not be estimated.';
    if (context && typeof (context as Response).json === 'function') {
      try {
        const payload = (await (context as Response).json()) as { error?: unknown };
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          message = payload.error;
        }
      } catch {
        // Keep the generic message.
      }
    }
    throw new Error(message);
  }
  const raw = (data ?? {}) as Partial<DifficultyEstimate>;
  const difficulty = Number(raw.difficulty);
  if (!Number.isFinite(difficulty)) {
    throw new Error('The difficulty could not be estimated.');
  }
  return {
    difficulty,
    confidence:
      raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    cached: raw.cached === true,
  };
}

/** Books still waiting for an estimate; a reader override makes it moot. */
export function booksNeedingEstimate<T extends Pick<Book, 'id' | 'difficulty_estimate' | 'difficulty_override'>>(
  books: readonly T[],
): T[] {
  return books.filter(
    (book) => book.difficulty_estimate === null && book.difficulty_override === null,
  );
}

const attemptedThisLaunch = new Set<number>();
let backfillRunning = false;

/** Test seam: forget which books were attempted. */
export function resetBackfillMemory(): void {
  attemptedThisLaunch.clear();
  backfillRunning = false;
}

/**
 * Estimate up to `limit` books sequentially. Returns how many estimates
 * were written. Safe to call repeatedly; concurrent calls no-op.
 */
export async function backfillDifficultyEstimates(
  books: readonly Book[],
  limit = BACKFILL_PER_LAUNCH,
): Promise<number> {
  if (backfillRunning) {
    return 0;
  }
  const pending = booksNeedingEstimate(books)
    .filter((book) => !attemptedThisLaunch.has(book.id))
    .slice(0, limit);
  if (pending.length === 0) {
    return 0;
  }
  backfillRunning = true;
  let written = 0;
  try {
    for (const book of pending) {
      attemptedThisLaunch.add(book.id);
      try {
        await requestDifficultyEstimate(book.id);
        written += 1;
      } catch {
        // One failure (offline, rate-limited, provider down) ends the pass;
        // the next launch tries again.
        break;
      }
    }
  } finally {
    backfillRunning = false;
  }
  return written;
}

/**
 * Mounts once inside the signed-in shell: whenever the library loads with
 * unrated books, rate a few and refresh the cached books so the chips and
 * the Reading Fitness model pick the new values up.
 */
export function useDifficultyBackfill(books: readonly Book[] | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!books || booksNeedingEstimate(books).length === 0) {
      return;
    }
    let cancelled = false;
    void backfillDifficultyEstimates(books).then((written) => {
      if (!cancelled && written > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [books, queryClient]);
}
