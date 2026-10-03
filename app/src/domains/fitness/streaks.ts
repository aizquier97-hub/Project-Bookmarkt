/**
 * Reading streaks (D-062) with "Reading Current" freezes.
 *
 * A day counts as READ when the reader logged an entry or finished a
 * Sandglass session. A day the reader only ENGAGED with the companion
 * (asked for a recap, used a cue-card tool, searched their notes) keeps the
 * current alive without adding to it - a Reading Current day. At most two
 * consecutive days can be carried this way; the third quiet day breaks the
 * streak. Today never breaks a streak: a streak is alive while yesterday is
 * covered, so the reader always has the rest of today to extend it.
 */

import { shiftDayKey } from '@/domains/fitness/days';

/** Consecutive days the companion can carry a streak without reading. */
export const MAX_CONSECUTIVE_FREEZES = 2;

export interface StreakInput {
  /** Local day keys on which reading happened. */
  readDays: ReadonlySet<string>;
  /** Local day keys with companion engagement only (may overlap readDays). */
  engagementDays: ReadonlySet<string>;
  today: string;
}

export type StreakState = 'active' | 'at_risk' | 'frozen' | 'none';

export interface StreakResult {
  /** Read days in the current run (frozen days are not counted). */
  current: number;
  /** Longest run ever, counted the same way. */
  longest: number;
  /** Reading Current days used inside the current run. */
  freezesUsed: number;
  /** True when today is already a read day. */
  readToday: boolean;
  /**
   * active: read today. at_risk: streak alive, nothing logged yet today.
   * frozen: today is covered only by companion engagement. none: no streak.
   */
  state: StreakState;
  /** First day of the current run (null when there is none). */
  startedOn: string | null;
}

export function computeStreak(input: StreakInput): StreakResult {
  const { readDays, engagementDays, today } = input;
  const readToday = readDays.has(today);
  const engagedToday = !readToday && engagementDays.has(today);

  // Walk backwards from today (or yesterday when today is still open).
  let cursor = readToday || engagedToday ? today : shiftDayKey(today, -1);
  let current = 0;
  let freezesUsed = 0;
  let consecutiveFreezes = 0;
  let startedOn: string | null = null;
  // Guard against runaway loops on malformed sets.
  for (let steps = 0; steps < 5000; steps++) {
    if (readDays.has(cursor)) {
      current += 1;
      consecutiveFreezes = 0;
      startedOn = cursor;
    } else if (engagementDays.has(cursor) && consecutiveFreezes < MAX_CONSECUTIVE_FREEZES) {
      consecutiveFreezes += 1;
      freezesUsed += 1;
    } else {
      break;
    }
    cursor = shiftDayKey(cursor, -1);
  }
  // Leading freezes before the first read day do not form a streak.
  if (current === 0) {
    freezesUsed = 0;
  }

  const longest = Math.max(current, computeLongestRun(readDays, engagementDays));

  let state: StreakState = 'none';
  if (current > 0) {
    state = readToday ? 'active' : engagedToday ? 'frozen' : 'at_risk';
  }
  return { current, longest, freezesUsed, readToday, state, startedOn };
}

function computeLongestRun(
  readDays: ReadonlySet<string>,
  engagementDays: ReadonlySet<string>,
): number {
  const sorted = [...readDays].sort();
  if (sorted.length === 0) {
    return 0;
  }
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    if (previous === null) {
      run = 1;
    } else {
      const gap = gapDays(previous, day);
      if (gap === 1 || (gap - 1 <= MAX_CONSECUTIVE_FREEZES && gapIsEngaged(previous, day, engagementDays))) {
        run += 1;
      } else {
        run = 1;
      }
    }
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

function gapDays(from: string, to: string): number {
  let cursor = from;
  for (let i = 1; i <= MAX_CONSECUTIVE_FREEZES + 1; i++) {
    cursor = shiftDayKey(cursor, 1);
    if (cursor === to) {
      return i;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function gapIsEngaged(from: string, to: string, engagementDays: ReadonlySet<string>): boolean {
  let cursor = shiftDayKey(from, 1);
  while (cursor !== to) {
    if (!engagementDays.has(cursor)) {
      return false;
    }
    cursor = shiftDayKey(cursor, 1);
  }
  return true;
}

/** Companion events that count as "staying in the current". */
export const ENGAGEMENT_EVENT_NAMES = [
  'companion_opened',
  'companion_message_sent',
  'companion_tool_used',
  'recap_requested',
  'semantic_search_used',
  'entry_flag_applied',
] as const;

export interface EngagementEventRow {
  created_at: string | null;
  topic_id: number | null;
}

/** Day keys from analytics rows, overall and per book. */
export function collectEngagementDays(
  rows: readonly EngagementEventRow[],
  toDayKey: (iso: string | null | undefined) => string | null,
): { all: Set<string>; byBook: Map<number, Set<string>> } {
  const all = new Set<string>();
  const byBook = new Map<number, Set<string>>();
  for (const row of rows) {
    const day = toDayKey(row.created_at);
    if (!day) {
      continue;
    }
    all.add(day);
    if (typeof row.topic_id === 'number') {
      let set = byBook.get(row.topic_id);
      if (!set) {
        set = new Set<string>();
        byBook.set(row.topic_id, set);
      }
      set.add(day);
    }
  }
  return { all, byBook };
}
