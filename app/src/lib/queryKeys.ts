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
  entrySummaries: ['entry-summaries'] as const,
  characters: (bookId: number) => ['characters', bookId] as const,
  bookImages: (bookId: number) => ['book-images', bookId] as const,
  bookmarks: ['bookmarks'] as const,
  bookmark: (code: string) => ['bookmark', code] as const,
  issueReports: ['issue-reports'] as const,
  companionEntitlement: ['companion-entitlement'] as const,
  /** Server answer to "may this reader start the companion trial?" (D-068). */
  companionTrialEligibility: ['companion-trial-eligibility'] as const,
  companionMessages: (bookId: number) => ['companion-messages', bookId] as const,
  companionRecap: (bookId: number) => ['companion-recap', bookId] as const,
  /** The automatic "story thus far" recap on the book hub (D-094); keyed by the last notes' fingerprint. */
  storyRecap: (bookId: number, notesKey: string) => ['story-recap', bookId, notesKey] as const,
  companionObservations: (bookId: number) => ['companion-observations', bookId] as const,
  companionPrimer: (bookId: number) => ['companion-primer', bookId] as const,
  /** Characters the companion spotted in one saved note (D-077); keyed by note hash. */
  companionCharacterExtract: (bookId: number, noteHash: string) =>
    ['companion-character-extract', bookId, noteHash] as const,
  /** Every entry across the library, for the Reading Fitness model (D-062). */
  activityEntries: ['activity-entries'] as const,
  /** The note just saved on the compose screen (D-092), for the journal's follow-ups. */
  lastSavedNote: (bookId: number) => ['last-saved-note', bookId] as const,
  readingSessions: ['reading-sessions'] as const,
  engagementDays: ['engagement-days'] as const,
  quotes: ['quotes'] as const,
};
