/**
 * Reading activity model (D-062): reduces the reader's entries and Sandglass
 * sessions to one row per (book, local day) carrying pages, minutes, a
 * comprehension factor, and the resulting Session Effort. Everything
 * downstream (Reading Fitness, volume, pace, streaks) is built from these
 * rows. Formulas are documented in docs/READING_METRICS.md.
 */

import { splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import { parseProgressBoundaryFromEntryText } from '@/domains/entries/progress';
import { dayKeyFromIso } from '@/domains/fitness/days';
import { countWords, difficultyWeight, DIFFICULTY_NEUTRAL } from '@/domains/fitness/difficulty';

export interface ActivityEntry {
  topic_id: number | null;
  text: string | null;
  created_at: string | null;
  reflection?: string | null;
}

export interface ActivitySession {
  topic_id: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  start_page: number | null;
  end_page: number | null;
  pages_read: number | null;
}

export interface BookDayActivity {
  bookId: number;
  day: string;
  /** Pages implied by the day's entry boundaries. */
  pagesFromEntries: number;
  /** Pages logged (or estimated from minutes) by the day's timed sessions. */
  pagesFromSessions: number;
  /** Credited pages: the larger of the two sources, never their sum. */
  pages: number;
  /** Timed minutes from Sandglass sessions. */
  minutes: number;
  sessions: number;
  entries: number;
  /** Words the reader wrote (notes, important flags, quote reflections). */
  noteWords: number;
  hasImportant: boolean;
  hasQuoteReflection: boolean;
  /** Comprehension factor C in [0.6, 1.4]. */
  comprehension: number;
  /** Difficulty Index D (1-10) used for this book. */
  difficulty: number;
  /** Session Effort: pages x (D / 5) x C. */
  effort: number;
}

/** Pages credited for a book's very first logged position (added mid-read). */
export const FIRST_POSITION_CREDIT_CAP = 50;
/** Chapters credited for a book's very first chapter position. */
export const FIRST_CHAPTER_CREDIT_CAP = 3;
/** Pages per chapter when a reader logs by chapter instead of page. */
export const DEFAULT_PAGES_PER_CHAPTER = 10;
/** A note with no page movement still implies a short stretch of reading. */
export const NOTE_ONLY_PAGE_CREDIT = 5;
/** Pages per minute assumed for timed sessions without a page range. */
export const DEFAULT_PACE_PAGES_PER_MINUTE = 0.5;

export const COMPREHENSION_MIN = 0.6;
export const COMPREHENSION_MAX = 1.4;
/** Note words at which the depth bonus saturates. */
export const COMPREHENSION_DEPTH_WORDS = 80;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Comprehension factor C (deterministic proxy, v1): starts at 0.6 for a
 * silent timed session and rises to 1.4 when the reader writes substantial
 * notes, flags an important moment, and reflects on a quote.
 */
export function computeComprehensionFactor(input: {
  entries: number;
  noteWords: number;
  hasImportant: boolean;
  hasQuoteReflection: boolean;
}): number {
  let factor = COMPREHENSION_MIN;
  if (input.entries > 0) {
    factor += 0.4;
  }
  factor += 0.2 * Math.min(1, Math.max(0, input.noteWords) / COMPREHENSION_DEPTH_WORDS);
  if (input.hasImportant) {
    factor += 0.1;
  }
  if (input.hasQuoteReflection) {
    factor += 0.1;
  }
  return round2(Math.min(COMPREHENSION_MAX, factor));
}

/** Session Effort E = pages x (D / 5) x C. */
export function computeEffort(pages: number, difficulty: number, comprehension: number): number {
  return round2(Math.max(0, pages) * difficultyWeight(difficulty) * comprehension);
}

export function sessionPages(session: ActivitySession): number | null {
  if (typeof session.pages_read === 'number' && session.pages_read >= 0) {
    return session.pages_read;
  }
  if (
    typeof session.start_page === 'number' &&
    typeof session.end_page === 'number' &&
    session.end_page >= session.start_page
  ) {
    return session.end_page - session.start_page;
  }
  return null;
}

/**
 * Median pages-per-minute across timed sessions with a known page range;
 * falls back to the default when the reader has none yet.
 */
export function estimatePacePagesPerMinute(sessions: readonly ActivitySession[]): number {
  const rates: number[] = [];
  for (const session of sessions) {
    const pages = sessionPages(session);
    if (pages === null || pages <= 0 || session.duration_seconds < 60) {
      continue;
    }
    rates.push(pages / (session.duration_seconds / 60));
  }
  if (rates.length === 0) {
    return DEFAULT_PACE_PAGES_PER_MINUTE;
  }
  rates.sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 === 0 ? (rates[mid - 1] + rates[mid]) / 2 : rates[mid];
}

interface EntryPageDelta {
  bookId: number;
  day: string;
  pages: number;
  noteWords: number;
  isImportant: boolean;
  isQuoteWithReflection: boolean;
}

function sortedAscending<T extends { created_at: string | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : 0;
    const right = b.created_at ? Date.parse(b.created_at) : 0;
    return left - right;
  });
}

/**
 * Walks each book's entries oldest-first and converts boundary headers into
 * page deltas ("page 21-35" is 15 pages; "page 40" after "page 35" is 5).
 */
export function deriveEntryDeltas(entries: readonly ActivityEntry[]): EntryPageDelta[] {
  const byBook = new Map<number, ActivityEntry[]>();
  for (const entry of entries) {
    if (typeof entry.topic_id !== 'number') {
      continue;
    }
    const list = byBook.get(entry.topic_id) ?? [];
    list.push(entry);
    byBook.set(entry.topic_id, list);
  }

  const deltas: EntryPageDelta[] = [];
  for (const [bookId, rows] of byBook) {
    let lastPage: number | null = null;
    let lastChapter: number | null = null;
    for (const entry of sortedAscending(rows)) {
      const day = dayKeyFromIso(entry.created_at);
      if (!day) {
        continue;
      }
      const boundary = parseProgressBoundaryFromEntryText(entry.text);
      let pages = 0;
      if (boundary && boundary.progressType === 'page') {
        if (boundary.lower !== null) {
          pages = Math.max(0, boundary.upper - boundary.lower + 1);
        } else if (lastPage !== null) {
          pages = Math.max(0, boundary.upper - lastPage);
        } else {
          pages = Math.min(boundary.upper, FIRST_POSITION_CREDIT_CAP);
        }
        lastPage = Math.max(lastPage ?? 0, boundary.upper);
      } else if (boundary && boundary.progressType === 'chapter') {
        let chapters = 0;
        if (boundary.lower !== null) {
          chapters = Math.max(0, boundary.upper - boundary.lower + 1);
        } else if (lastChapter !== null) {
          chapters = Math.max(0, boundary.upper - lastChapter);
        } else {
          chapters = Math.min(boundary.upper, FIRST_CHAPTER_CREDIT_CAP);
        }
        lastChapter = Math.max(lastChapter ?? 0, boundary.upper);
        pages = chapters * DEFAULT_PAGES_PER_CHAPTER;
      }

      const { body } = splitEntryText(entry.text);
      const parsed = parseEntryKind(body);
      const reflectionWords = countWords(String(entry.reflection ?? ''));
      const ownWords = parsed.kind === 'quote' ? 0 : countWords(parsed.body);
      deltas.push({
        bookId,
        day,
        pages,
        noteWords: ownWords + reflectionWords,
        isImportant: parsed.kind === 'important',
        isQuoteWithReflection: parsed.kind === 'quote' && reflectionWords > 0,
      });
    }
  }
  return deltas;
}

export interface BuildActivityInput {
  entries: readonly ActivityEntry[];
  sessions: readonly ActivitySession[];
  /** Difficulty Index per book id; books missing here use the neutral 5.0. */
  difficultyByBook: ReadonlyMap<number, number>;
}

/** One row per (book, day), newest day last. */
export function buildBookDayActivity(input: BuildActivityInput): BookDayActivity[] {
  const pace = estimatePacePagesPerMinute(input.sessions);
  const rows = new Map<string, BookDayActivity>();

  const rowFor = (bookId: number, day: string): BookDayActivity => {
    const key = `${bookId}|${day}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        bookId,
        day,
        pagesFromEntries: 0,
        pagesFromSessions: 0,
        pages: 0,
        minutes: 0,
        sessions: 0,
        entries: 0,
        noteWords: 0,
        hasImportant: false,
        hasQuoteReflection: false,
        comprehension: COMPREHENSION_MIN,
        difficulty: input.difficultyByBook.get(bookId) ?? DIFFICULTY_NEUTRAL,
        effort: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const delta of deriveEntryDeltas(input.entries)) {
    const row = rowFor(delta.bookId, delta.day);
    row.entries += 1;
    row.pagesFromEntries += delta.pages;
    row.noteWords += delta.noteWords;
    row.hasImportant = row.hasImportant || delta.isImportant;
    row.hasQuoteReflection = row.hasQuoteReflection || delta.isQuoteWithReflection;
  }

  for (const session of input.sessions) {
    const day = dayKeyFromIso(session.started_at);
    if (!day || session.duration_seconds <= 0) {
      continue;
    }
    const row = rowFor(session.topic_id, day);
    const minutes = session.duration_seconds / 60;
    row.sessions += 1;
    row.minutes += minutes;
    const pages = sessionPages(session);
    row.pagesFromSessions += pages !== null ? pages : minutes * pace;
  }

  const result: BookDayActivity[] = [];
  for (const row of rows.values()) {
    row.minutes = Math.round(row.minutes * 10) / 10;
    row.pagesFromSessions = Math.round(row.pagesFromSessions);
    let pages = Math.max(row.pagesFromEntries, row.pagesFromSessions);
    if (pages === 0 && row.entries > 0) {
      pages = NOTE_ONLY_PAGE_CREDIT;
    }
    row.pages = pages;
    row.comprehension = computeComprehensionFactor(row);
    row.effort = computeEffort(row.pages, row.difficulty, row.comprehension);
    result.push(row);
  }
  result.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.bookId - b.bookId));
  return result;
}

export interface DailyLoad {
  day: string;
  effort: number;
  pages: number;
  minutes: number;
  entries: number;
  sessions: number;
  books: number;
}

/** Sums book-day rows into one row per day, ascending. */
export function aggregateDailyLoad(rows: readonly BookDayActivity[]): DailyLoad[] {
  const byDay = new Map<string, DailyLoad>();
  for (const row of rows) {
    let load = byDay.get(row.day);
    if (!load) {
      load = { day: row.day, effort: 0, pages: 0, minutes: 0, entries: 0, sessions: 0, books: 0 };
      byDay.set(row.day, load);
    }
    load.effort = round2(load.effort + row.effort);
    load.pages += row.pages;
    load.minutes = Math.round((load.minutes + row.minutes) * 10) / 10;
    load.entries += row.entries;
    load.sessions += row.sessions;
    load.books += 1;
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
