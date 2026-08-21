import {
  parseProgressBoundaryFromEntryText,
  type ProgressBoundary,
} from '@/domains/entries/progress';

/**
 * Pure companion grounding rules (roadmap §11): context is assembled
 * exclusively from the requesting user's own rows, the latest entry defines
 * the spoiler boundary, and every context carries provenance metadata.
 * Pure and side-effect free so the grounding guarantees are unit-testable.
 */

export interface GroundingEntryRow {
  id: number;
  user_id: string | null;
  topic_id: number | null;
  text: string | null;
  created_at: string | null;
}

export interface GroundingCharacterRow {
  id: number;
  user_id: string | null;
  topic_id: number | null;
  name: string;
  description: string | null;
}

export interface CompanionContext {
  provenance: {
    source: 'user_entries';
    userId: string;
    bookId: number;
    assembledAt: string;
    entryIds: number[];
    characterIds: number[];
  };
  /** Boundary parsed from the most recent entry with a progress header. */
  boundary: ProgressBoundary | null;
  boundaryLabel: string | null;
  entries: { id: number; text: string; createdAt: string | null }[];
  characters: { id: number; name: string; description: string | null }[];
}

export class CompanionGroundingError extends Error {
  readonly code: 'cross_account_row' | 'cross_book_row';

  constructor(code: 'cross_account_row' | 'cross_book_row') {
    super(
      code === 'cross_account_row'
        ? 'Companion context may only contain rows owned by the requesting user.'
        : 'Companion context may only contain rows for the requested book.',
    );
    this.name = 'CompanionGroundingError';
    this.code = code;
  }
}

function assertOwnRows(
  rows: { user_id: string | null; topic_id: number | null }[],
  requestingUserId: string,
  bookId: number,
): void {
  for (const row of rows) {
    // A null owner or book is a legacy anomaly; refuse rather than guess.
    if (row.user_id !== requestingUserId) {
      throw new CompanionGroundingError('cross_account_row');
    }
    if (row.topic_id !== bookId) {
      throw new CompanionGroundingError('cross_book_row');
    }
  }
}

function sortNewestFirst<T extends { created_at: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

/** The latest entry with a parseable progress header defines the boundary. */
export function findLatestEntryBoundary(
  entries: { text: string | null; created_at: string | null }[],
): ProgressBoundary | null {
  for (const entry of sortNewestFirst(entries)) {
    const parsed = parseProgressBoundaryFromEntryText(entry.text);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export function assembleCompanionContext(params: {
  requestingUserId: string;
  bookId: number;
  entries: GroundingEntryRow[];
  characters: GroundingCharacterRow[];
  now?: Date;
}): CompanionContext {
  const { requestingUserId, bookId, entries, characters } = params;

  // Defense in depth: RLS and user-scoped queries already restrict rows, but
  // the assembler independently refuses anything cross-account or cross-book.
  assertOwnRows(entries, requestingUserId, bookId);
  assertOwnRows(characters, requestingUserId, bookId);

  const boundary = findLatestEntryBoundary(entries);
  const ordered = sortNewestFirst(entries).reverse();

  return {
    provenance: {
      source: 'user_entries',
      userId: requestingUserId,
      bookId,
      assembledAt: (params.now ?? new Date()).toISOString(),
      entryIds: ordered.map((entry) => entry.id),
      characterIds: characters.map((character) => character.id),
    },
    boundary,
    boundaryLabel: boundary ? `${boundary.progressType} ${boundary.upper}` : null,
    entries: ordered.map((entry) => ({
      id: entry.id,
      text: entry.text ?? '',
      createdAt: entry.created_at,
    })),
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
    })),
  };
}
