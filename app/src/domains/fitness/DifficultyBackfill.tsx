import { useQuery } from '@tanstack/react-query';

import { useDifficultyBackfill } from '@/domains/fitness/difficultyEstimate';
import { listBooks } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Renders nothing; keeps the library's Difficulty Index estimates filled in
 * (D-063). Shares the books query every tab already subscribes to, so it
 * never adds a request of its own.
 */
export function DifficultyBackfill() {
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  useDifficultyBackfill(booksQuery.data);
  return null;
}
