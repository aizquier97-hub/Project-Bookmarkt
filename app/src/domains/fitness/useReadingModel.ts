import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildReadingModel, type ReadingModel } from '@/domains/fitness/model';
import {
  listActivityEntries,
  listEngagementDays,
  listReadingSessions,
} from '@/domains/fitness/service';
import { listBooks, type Book } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';

export interface ReadingModelQuery {
  model: ReadingModel<Book> | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  isRefetching: boolean;
}

/**
 * Loads the four inputs of the Reading Fitness model and memoizes the
 * assembled result. Engagement days are optional: if the analytics read
 * fails the model still builds, just without Reading Current freezes.
 */
export function useReadingModel(): ReadingModelQuery {
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  const entriesQuery = useQuery({
    queryKey: queryKeys.activityEntries,
    queryFn: listActivityEntries,
  });
  const sessionsQuery = useQuery({
    queryKey: queryKeys.readingSessions,
    queryFn: listReadingSessions,
  });
  const engagementQuery = useQuery({
    queryKey: queryKeys.engagementDays,
    queryFn: listEngagementDays,
    retry: 0,
  });

  const ready =
    booksQuery.data !== undefined &&
    entriesQuery.data !== undefined &&
    sessionsQuery.data !== undefined &&
    (engagementQuery.data !== undefined || engagementQuery.isError);

  const model = useMemo(() => {
    if (!ready) {
      return null;
    }
    return buildReadingModel<Book>({
      books: booksQuery.data ?? [],
      entries: entriesQuery.data ?? [],
      sessions: sessionsQuery.data ?? [],
      engagementDays: engagementQuery.data ?? { all: new Set(), byBook: new Map() },
    });
  }, [ready, booksQuery.data, entriesQuery.data, sessionsQuery.data, engagementQuery.data]);

  const firstError = booksQuery.error ?? entriesQuery.error ?? sessionsQuery.error ?? null;

  return {
    model,
    isPending: !ready && !firstError,
    isError: Boolean(firstError),
    error: firstError,
    refetch: () =>
      Promise.all([
        booksQuery.refetch(),
        entriesQuery.refetch(),
        sessionsQuery.refetch(),
        engagementQuery.refetch(),
      ]),
    isRefetching:
      booksQuery.isRefetching || entriesQuery.isRefetching || sessionsQuery.isRefetching,
  };
}

/** Cache keys every reading-related mutation should invalidate. */
export const READING_MODEL_KEYS = [
  queryKeys.activityEntries,
  queryKeys.readingSessions,
  queryKeys.engagementDays,
] as const;
