import { useQuery } from '@tanstack/react-query';

import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { useComprehensionBackfill } from '@/domains/fitness/comprehension';
import { listActivityEntries } from '@/domains/fitness/service';
import { listBooks } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Renders nothing; keeps the companion's comprehension scores current for
 * entitled readers (D-065). Shares the books, activity-entries, and
 * entitlement queries the Profile and companion screens already subscribe
 * to, so it adds no request of its own beyond the grading calls.
 */
export function ComprehensionBackfill() {
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  const entriesQuery = useQuery({
    queryKey: queryKeys.activityEntries,
    queryFn: listActivityEntries,
  });
  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  useComprehensionBackfill(
    booksQuery.data,
    entriesQuery.data,
    entitlementQuery.data?.entitled === true,
  );
  return null;
}
