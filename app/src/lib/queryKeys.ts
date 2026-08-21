/**
 * Central query-key factory (roadmap §11 "selected-book state").
 *
 * Every book-scoped resource carries its bookId in the cache key, so the
 * "selected book" is exactly the key a mounted screen subscribes to. React
 * Query versions requests per key and ignores out-of-date responses for keys
 * no longer mounted, which is what makes stale responses unable to cross book
 * boundaries: switching books switches subscriptions instead of mutating any
 * shared "current book" state that a late response could overwrite.
 */
export const queryKeys = {
  books: ['books'] as const,
  book: (bookId: number) => ['book', bookId] as const,
  entries: (bookId: number) => ['entries', bookId] as const,
  characters: (bookId: number) => ['characters', bookId] as const,
  bookImages: (bookId: number) => ['book-images', bookId] as const,
  bookmarks: ['bookmarks'] as const,
  bookmark: (code: string) => ['bookmark', code] as const,
  issueReports: ['issue-reports'] as const,
};
