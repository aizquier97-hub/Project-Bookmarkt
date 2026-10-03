/**
 * Segment Trophy System (D-062): every book with a page count is split into
 * four equal segments; crossing each quarter unlocks one trophy piece, and
 * finishing the book completes the trophy and places it in the reader's
 * trophy case on the Progress tab. Position comes from the same entry
 * boundaries and Sandglass sessions the rest of the app already trusts.
 */

export const TROPHY_SEGMENTS = 4;

export interface TrophySegment {
  index: number;
  /** Page the reader must reach to unlock this piece. */
  thresholdPage: number;
  unlocked: boolean;
}

export interface TrophyProgress {
  /** Whether the book can earn pieces (needs a page count). */
  eligible: boolean;
  totalPages: number | null;
  /** The reader's furthest known page (0 when nothing is logged). */
  currentPage: number;
  segments: TrophySegment[];
  unlockedCount: number;
  /** True when every piece is unlocked (finished or last page reached). */
  complete: boolean;
  /** Pages until the next piece; null when complete or ineligible. */
  pagesToNext: number | null;
  /** 0-1 progress within the current segment. */
  segmentFraction: number;
}

export interface TrophyInput {
  totalPages: number | null | undefined;
  currentPage: number | null | undefined;
  finished: boolean;
}

export function segmentThreshold(totalPages: number, index: number): number {
  if (index >= TROPHY_SEGMENTS) {
    return totalPages;
  }
  return Math.ceil((totalPages * index) / TROPHY_SEGMENTS);
}

export function computeTrophyProgress(input: TrophyInput): TrophyProgress {
  const totalPages =
    typeof input.totalPages === 'number' && Number.isFinite(input.totalPages) && input.totalPages > 0
      ? Math.floor(input.totalPages)
      : null;
  const currentPage = Math.max(0, Math.floor(input.currentPage ?? 0));

  if (totalPages === null) {
    const segments = Array.from({ length: TROPHY_SEGMENTS }, (_, i) => ({
      index: i + 1,
      thresholdPage: 0,
      unlocked: input.finished,
    }));
    return {
      eligible: false,
      totalPages: null,
      currentPage,
      segments,
      unlockedCount: input.finished ? TROPHY_SEGMENTS : 0,
      complete: input.finished,
      pagesToNext: null,
      segmentFraction: input.finished ? 1 : 0,
    };
  }

  const effectivePage = input.finished ? totalPages : Math.min(currentPage, totalPages);
  const segments: TrophySegment[] = [];
  for (let i = 1; i <= TROPHY_SEGMENTS; i++) {
    const thresholdPage = segmentThreshold(totalPages, i);
    segments.push({ index: i, thresholdPage, unlocked: effectivePage >= thresholdPage });
  }
  const unlockedCount = segments.filter((segment) => segment.unlocked).length;
  const complete = unlockedCount === TROPHY_SEGMENTS;
  const next = segments.find((segment) => !segment.unlocked) ?? null;
  const previousThreshold = next ? segmentThreshold(totalPages, next.index - 1) : totalPages;
  const span = next ? Math.max(1, next.thresholdPage - previousThreshold) : 1;
  const segmentFraction = complete
    ? 1
    : Math.min(1, Math.max(0, (effectivePage - previousThreshold) / span));

  return {
    eligible: true,
    totalPages,
    currentPage: effectivePage,
    segments,
    unlockedCount,
    complete,
    pagesToNext: next ? Math.max(0, next.thresholdPage - effectivePage) : null,
    segmentFraction,
  };
}

/** Pieces that are unlocked in `after` but were not in `before`. */
export function newlyUnlockedSegments(
  before: TrophyProgress,
  after: TrophyProgress,
): TrophySegment[] {
  return after.segments.filter(
    (segment) => segment.unlocked && !before.segments[segment.index - 1]?.unlocked,
  );
}

const PIECE_NAMES = ['First quarter', 'Halfway', 'Three quarters', 'Finished'] as const;

export function describeTrophyPiece(index: number): string {
  return PIECE_NAMES[index - 1] ?? `Piece ${index}`;
}

/** The one-line celebration shown when a piece unlocks. */
export function trophyUnlockMessage(bookName: string, segments: readonly TrophySegment[]): string {
  if (segments.length === 0) {
    return '';
  }
  const last = segments[segments.length - 1];
  if (last.index === TROPHY_SEGMENTS) {
    return `Trophy complete: ${bookName} joins your trophy case.`;
  }
  return `Trophy piece ${last.index} of ${TROPHY_SEGMENTS} unlocked - ${describeTrophyPiece(last.index).toLowerCase()} of ${bookName}.`;
}
