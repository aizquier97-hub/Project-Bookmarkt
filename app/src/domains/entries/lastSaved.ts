import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';

/** The note the reader just saved, kept for the journal's post-save follow-ups (D-077). */
export type LastSavedNote = {
  id: number;
  text: string;
  /** "page 142" stamp for any characters first met in this note ('' when unknown). */
  firstNoted: string;
};

/**
 * The entry composer lives on its own screen (D-092) and the "Anyone new in
 * that note?" card lives on the journal, so the saved note travels through
 * the query cache: the composer remembers it, the journal shows it until the
 * reader is done. It is never fetched - the cache is just the hand-off.
 */
export function rememberLastSavedNote(
  queryClient: QueryClient,
  bookId: number,
  note: LastSavedNote | null,
) {
  queryClient.setQueryData<LastSavedNote | null>(queryKeys.lastSavedNote(bookId), note);
}

export function useLastSavedNote(bookId: number) {
  const queryClient = useQueryClient();
  const query = useQuery<LastSavedNote | null>({
    queryKey: queryKeys.lastSavedNote(bookId),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    note: query.data ?? null,
    dismiss: () => rememberLastSavedNote(queryClient, bookId, null),
  };
}
