/**
 * Recall match records (D-066): the best clear per book and board size,
 * kept on the device only. A personal best is a Strava-style nudge, not
 * reader data worth a table; losing it with the app is acceptable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { betterResult, type GameResult } from '@/domains/cueCards/memoryGame';

const KEY_PREFIX = 'bookmarkt.recall.best';

function recordKey(bookId: number, pairs: number): string {
  return `${KEY_PREFIX}.${bookId}.${pairs}`;
}

function parseRecord(raw: string | null): GameResult | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GameResult>;
    const seconds = Number(parsed.seconds);
    const turns = Number(parsed.turns);
    const pairs = Number(parsed.pairs);
    if (!Number.isFinite(seconds) || !Number.isFinite(turns) || !Number.isFinite(pairs)) {
      return null;
    }
    return { seconds, turns, pairs };
  } catch {
    return null;
  }
}

/** The stored best for this book at this board size, or null. */
export async function loadBestResult(bookId: number, pairs: number): Promise<GameResult | null> {
  const raw = await AsyncStorage.getItem(recordKey(bookId, pairs)).catch(() => null);
  return parseRecord(raw);
}

/**
 * Record a clear. Returns the best after this game and whether this game
 * set it (a first clear counts as a record).
 */
export async function recordResult(
  bookId: number,
  result: GameResult,
): Promise<{ best: GameResult; isRecord: boolean }> {
  const previous = await loadBestResult(bookId, result.pairs);
  const best = betterResult(previous, result);
  const isRecord = best === result;
  if (isRecord) {
    await AsyncStorage.setItem(recordKey(bookId, result.pairs), JSON.stringify(result)).catch(
      () => undefined,
    );
  }
  return { best, isRecord };
}
