/**
 * Model-assessed comprehension (D-065, rubric r2 since D-066). The companion
 * grades a book's notes against a four-mark rubric (recall, interpretation,
 * connection, evaluation) and caches the result on the topic row, keyed by a
 * hash of the material it read plus the rubric revision. This module mirrors
 * the server's material builder and hash so the client can tell, without a
 * network call, which books are unassessed, have new writing since their
 * last grading, or were graded under an older rubric - and backfills them a
 * few at a time, exactly like the Difficulty Index (D-063).
 *
 * The backfill only runs for entitled readers: the companion gate on the
 * server would deny everyone else anyway, so skipping it saves a request
 * per launch and keeps the Reading Fitness model on the deterministic v1
 * comprehension factor for them.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { requestComprehensionScore } from '@/domains/companion/api';
import type { ActivityEntry } from '@/domains/fitness/activity';
import type { Book } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';

/** Longest material string the server grades (newest lines kept). */
export const COMPREHENSION_MAX_CHARS = 24000;
/** Books assessed per app launch (the server also caps per user per day). */
export const COMPREHENSION_BACKFILL_PER_LAUNCH = 4;

/** Entries per book the server grades (newest first when a book has more). */
export const COMPREHENSION_MAX_ENTRIES = 400;

/**
 * Rubric revision, appended to the hash on both sides so a reweighted
 * rubric regrades every cached book. Must match the Edge Function's
 * COMPREHENSION_RUBRIC_VERSION.
 */
export const COMPREHENSION_RUBRIC_VERSION = 'r2';

export interface ComprehensionEntry {
  text: string | null;
  created_at: string | null;
  reflection?: string | null;
}

/**
 * Builds the material the server grades: entries oldest first, one line
 * each (`text || Reflection: ...`), newest lines kept within the cap.
 * Must stay byte-for-byte identical to the Edge Function's builder so the
 * hashes agree.
 */
export function buildComprehensionMaterial(rows: readonly ComprehensionEntry[]): {
  material: string;
  entryCount: number;
} {
  const newestFirst = [...rows]
    .sort((a, b) => {
      const left = String(a.created_at ?? '');
      const right = String(b.created_at ?? '');
      if (left !== right) return left < right ? 1 : -1;
      return String(a.text ?? '') < String(b.text ?? '') ? 1 : -1;
    })
    .slice(0, COMPREHENSION_MAX_ENTRIES);
  const sorted = newestFirst.sort((a, b) => {
    const left = String(a.created_at ?? '');
    const right = String(b.created_at ?? '');
    if (left !== right) return left < right ? -1 : 1;
    return String(a.text ?? '') < String(b.text ?? '') ? -1 : 1;
  });
  const lines: string[] = [];
  for (const row of sorted) {
    const text = String(row.text ?? '').trim().replace(/\s+/g, ' ');
    const reflection = String(row.reflection ?? '').trim().replace(/\s+/g, ' ');
    if (!text && !reflection) continue;
    lines.push(reflection ? `${text} || Reflection: ${reflection}` : text);
  }
  let chars = 0;
  let start = lines.length;
  while (start > 0 && chars + lines[start - 1].length + 1 <= COMPREHENSION_MAX_CHARS) {
    chars += lines[start - 1].length + 1;
    start -= 1;
  }
  const kept = lines.slice(start);
  return { material: kept.join('\n'), entryCount: kept.length };
}

/**
 * djb2 content hash in the Edge Function's `hashContent` shape, suffixed
 * with the rubric revision (`djb2:<hex>:<length>:r2`).
 */
export function hashComprehensionMaterial(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return `djb2:${(hash >>> 0).toString(16)}:${value.length}:${COMPREHENSION_RUBRIC_VERSION}`;
}

type ComprehensionBook = Pick<Book, 'id' | 'comprehension_hash' | 'comprehension_score'>;

/**
 * Books whose notes have never been graded, or have changed since. A book
 * with no written material is skipped: the server would only answer
 * NO_ENTRIES.
 */
export function booksNeedingComprehension<T extends ComprehensionBook>(
  books: readonly T[],
  entries: readonly ActivityEntry[],
): T[] {
  const byBook = new Map<number, ActivityEntry[]>();
  for (const entry of entries) {
    if (entry.topic_id === null) continue;
    const list = byBook.get(entry.topic_id);
    if (list) list.push(entry);
    else byBook.set(entry.topic_id, [entry]);
  }
  return books.filter((book) => {
    const rows = byBook.get(book.id);
    if (!rows || rows.length === 0) return false;
    const built = buildComprehensionMaterial(rows);
    if (built.entryCount === 0) return false;
    if (book.comprehension_score === null || book.comprehension_hash === null) return true;
    return book.comprehension_hash !== hashComprehensionMaterial(built.material);
  });
}

const attemptedThisLaunch = new Set<number>();
let backfillRunning = false;

/** Test seam: forget which books were attempted. */
export function resetComprehensionBackfillMemory(): void {
  attemptedThisLaunch.clear();
  backfillRunning = false;
}

/**
 * Grade up to `limit` books sequentially. Returns how many scores were
 * written (cache hits count too: the row already carries the value, and a
 * refresh of the books query is what the caller does with a positive
 * count). Concurrent calls no-op; a failure ends the pass until next launch.
 */
export async function backfillComprehensionScores(
  books: readonly Book[],
  entries: readonly ActivityEntry[],
  limit = COMPREHENSION_BACKFILL_PER_LAUNCH,
): Promise<number> {
  if (backfillRunning) {
    return 0;
  }
  const pending = booksNeedingComprehension(books, entries)
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
        const result = await requestComprehensionScore(book.id);
        if (result.comprehension) {
          written += 1;
        }
      } catch {
        // Offline, quota reached, not entitled, or provider down: stop
        // here; the next launch tries again.
        break;
      }
    }
  } finally {
    backfillRunning = false;
  }
  return written;
}

/**
 * Mounts once inside the signed-in shell: when the library and its entries
 * are loaded for an entitled reader, grade a few books that need it and
 * refresh the cached books so the Reading Fitness model blends the scores in.
 */
export function useComprehensionBackfill(
  books: readonly Book[] | undefined,
  entries: readonly ActivityEntry[] | undefined,
  entitled: boolean,
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!entitled || !books || !entries) {
      return;
    }
    if (booksNeedingComprehension(books, entries).length === 0) {
      return;
    }
    let cancelled = false;
    void backfillComprehensionScores(books, entries).then((written) => {
      if (!cancelled && written > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [books, entries, entitled, queryClient]);
}
