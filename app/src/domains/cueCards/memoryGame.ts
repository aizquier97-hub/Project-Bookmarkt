/**
 * Recall match (D-065, game-only since D-066): a concentration game dealt
 * from the reader's own cue cards. Each card contributes one pair - its cue
 * face and its answer face - and the reader turns two tiles at a time
 * looking for the pair that belongs together, against a clock. Pure logic
 * lives here so the board, the flip rules, the clock, and the "enough
 * material?" checks are testable without UI.
 */

import type { CompanionCueCard } from '@/domains/companion/api';

/** Fewest cards that make a game worth dealing (6 tiles). */
export const MIN_PAIRS = 3;
/** Most cards used per board (10 tiles, two across - D-066 made the tiles bigger). */
export const MAX_PAIRS = 5;
/** Two decks this alike mean the records have no fresh cues left. */
export const DECK_OVERLAP_CEILING = 0.8;
/** How long a mismatched pair stays face up before turning back (ms). */
export const MISMATCH_LINGER_MS = 900;

export type TileFace = 'cue' | 'answer';

export interface MemoryTile {
  /** Stable key within one board. */
  id: number;
  /** Which cue card this tile belongs to; two tiles share each pairId. */
  pairId: number;
  face: TileFace;
  text: string;
}

export interface MemoryBoard {
  tiles: MemoryTile[];
  /** Tile ids currently face up and not yet matched (0, 1, or 2). */
  revealed: number[];
  /** Pair ids already found. */
  matched: number[];
  /** Pairs of tiles turned so far. */
  moves: number;
  /** True while two unmatched tiles sit face up awaiting the turn-back. */
  mismatch: boolean;
}

export type Rng = () => number;

/** Fisher-Yates with an injectable source so boards are reproducible in tests. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Cards that can seed a board: both faces present and distinct. Duplicated
 * cues (the model occasionally repeats itself) keep only their first card
 * so a tile never has two correct partners.
 */
export function playableCards(cards: readonly CompanionCueCard[]): CompanionCueCard[] {
  const seen = new Set<string>();
  const out: CompanionCueCard[] = [];
  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    if (!front || !back || front.toLowerCase() === back.toLowerCase()) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
  }
  return out;
}

/** True when a deck has enough distinct cards for a game. */
export function hasEnoughForBoard(cards: readonly CompanionCueCard[]): boolean {
  return playableCards(cards).length >= MIN_PAIRS;
}

/**
 * Deal a board from up to MAX_PAIRS cards. Which cards are used is itself
 * random so a big deck yields different boards on "same cards, reshuffled".
 * Throws when fewer than MIN_PAIRS playable cards exist; callers check
 * `hasEnoughForBoard` first.
 */
export function buildBoard(cards: readonly CompanionCueCard[], rng: Rng = Math.random): MemoryBoard {
  const usable = playableCards(cards);
  if (usable.length < MIN_PAIRS) {
    throw new Error(`A board needs at least ${MIN_PAIRS} cards.`);
  }
  const chosen = shuffle(usable, rng).slice(0, MAX_PAIRS);
  const tiles: MemoryTile[] = [];
  chosen.forEach((card, pairId) => {
    tiles.push({ id: pairId * 2, pairId, face: 'cue', text: card.front });
    tiles.push({ id: pairId * 2 + 1, pairId, face: 'answer', text: card.back });
  });
  return { tiles: shuffle(tiles, rng), revealed: [], matched: [], moves: 0, mismatch: false };
}

/**
 * Turn a tile face up. Ignored while a mismatch is lingering, for matched
 * tiles, and for a tile already showing. The second tile of a turn either
 * completes a pair (both go to `matched`) or leaves both showing with
 * `mismatch` set until `hideMismatch` is applied.
 */
export function applyFlip(board: MemoryBoard, tileId: number): MemoryBoard {
  if (board.mismatch) return board;
  const tile = board.tiles.find((t) => t.id === tileId);
  if (!tile) return board;
  if (board.matched.includes(tile.pairId)) return board;
  if (board.revealed.includes(tileId)) return board;
  if (board.revealed.length >= 2) return board;

  const revealed = [...board.revealed, tileId];
  if (revealed.length < 2) {
    return { ...board, revealed };
  }
  const first = board.tiles.find((t) => t.id === revealed[0]);
  const moves = board.moves + 1;
  if (first && first.pairId === tile.pairId) {
    return { ...board, revealed: [], matched: [...board.matched, tile.pairId], moves };
  }
  return { ...board, revealed, moves, mismatch: true };
}

/** Turn a lingering mismatched pair back over. */
export function hideMismatch(board: MemoryBoard): MemoryBoard {
  if (!board.mismatch) return board;
  return { ...board, revealed: [], mismatch: false };
}

export function pairCount(board: MemoryBoard): number {
  return board.tiles.length / 2;
}

export function isWon(board: MemoryBoard): boolean {
  return board.tiles.length > 0 && board.matched.length === pairCount(board);
}

/** A tile is showing when it is revealed or already matched. */
export function isFaceUp(board: MemoryBoard, tile: MemoryTile): boolean {
  return board.matched.includes(tile.pairId) || board.revealed.includes(tile.id);
}

/**
 * Share of the new deck's cues that already appeared in the previous deck
 * (case-insensitive). Near 1 means the companion is recycling the same
 * material and the reader should write more before dealing again.
 */
export function deckOverlap(
  previous: readonly CompanionCueCard[],
  next: readonly CompanionCueCard[],
): number {
  if (next.length === 0) return 1;
  const seen = new Set(previous.map((card) => card.front.trim().toLowerCase()));
  let repeats = 0;
  for (const card of next) {
    if (seen.has(card.front.trim().toLowerCase())) repeats += 1;
  }
  return repeats / next.length;
}

/** The copy shown when the records cannot support a fresh board. */
export const NEED_MORE_MATERIAL =
  'Your records cannot deal a fresh board yet. Add a few more entries or characters and come back.';

/** Whole seconds as a stopwatch reads them: 0:07, 1:05, 12:30. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

/** A finished game: how long it took and how many pairs of tiles were turned. */
export interface GameResult {
  seconds: number;
  turns: number;
  pairs: number;
}

/**
 * The better of two results for the record: fewer seconds wins; equal
 * seconds fall back to fewer turns. Records are kept per board size, so
 * callers compare results of the same `pairs` only.
 */
export function betterResult(current: GameResult | null, next: GameResult): GameResult {
  if (!current) return next;
  if (next.seconds !== current.seconds) {
    return next.seconds < current.seconds ? next : current;
  }
  return next.turns < current.turns ? next : current;
}
