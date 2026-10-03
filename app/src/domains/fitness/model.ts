/**
 * The assembled Reading Fitness model (D-062): one pure function that turns
 * the reader's books, entries, Sandglass sessions, and companion engagement
 * days into everything the Progress tab, book screen, and timer wrap-up
 * display. Pure so it is unit-testable and cheap to memoize.
 */

import { splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import { parseProgressBoundaryFromEntryText } from '@/domains/entries/progress';
import {
  aggregateDailyLoad,
  buildBookDayActivity,
  type ActivityEntry,
  type ActivitySession,
  type BookDayActivity,
  type DailyLoad,
} from '@/domains/fitness/activity';
import { dayKey, dayKeyFromIso } from '@/domains/fitness/days';
import { computeDifficulty, type DifficultyResult } from '@/domains/fitness/difficulty';
import {
  computeFitnessSeries,
  computeHeatmap,
  computeProgressSummary,
  computeWeeklyVolume,
  volumeVersusFourWeekAverage,
  type FitnessPoint,
  type HeatmapCell,
  type ProgressSummary,
  type WeekVolume,
} from '@/domains/fitness/fitness';
import { computeStreak, type StreakResult } from '@/domains/fitness/streaks';
import { computeTrophyProgress, type TrophyProgress } from '@/domains/fitness/trophies';

export interface ModelBook {
  id: number;
  name: string;
  author: string | null;
  cover_url: string | null;
  genre: string | null;
  publication_year: number | null;
  total_pages: number | null;
  finished_at: string | null;
  difficulty_override: number | null;
  difficulty_estimate: number | null;
  difficulty_estimate_confidence: string | null;
}

export interface BookFitness<TBook extends ModelBook = ModelBook> {
  book: TBook;
  difficulty: DifficultyResult;
  /** Furthest page known from entries or sessions (0 when none). */
  currentPage: number;
  trophy: TrophyProgress;
  streak: StreakResult;
  pages: number;
  minutes: number;
  sessions: number;
  lastActiveDay: string | null;
}

export interface ReadingModel<TBook extends ModelBook = ModelBook> {
  today: string;
  activity: BookDayActivity[];
  loads: DailyLoad[];
  series: FitnessPoint[];
  summary: ProgressSummary;
  weekly: WeekVolume[];
  volume: ReturnType<typeof volumeVersusFourWeekAverage>;
  heatmap: HeatmapCell[];
  streak: StreakResult;
  books: BookFitness<TBook>[];
  /** Books whose trophy is complete, most recently finished first. */
  trophyCase: BookFitness<TBook>[];
  difficultyByBook: Map<number, number>;
  /** Books with at least one unlocked piece, most pieces first. */
  trophiesInProgress: BookFitness<TBook>[];
}

export interface BuildReadingModelInput<TBook extends ModelBook> {
  books: readonly TBook[];
  entries: readonly ActivityEntry[];
  sessions: readonly ActivitySession[];
  engagementDays: { all: ReadonlySet<string>; byBook: ReadonlyMap<number, ReadonlySet<string>> };
  today?: string;
}

export const WEEKLY_VOLUME_WEEKS = 12;
export const HEATMAP_WEEKS = 16;

/** Verbatim quote bodies per book, the sample the Difficulty Index reads. */
export function collectQuoteTextsByBook(entries: readonly ActivityEntry[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const entry of entries) {
    if (typeof entry.topic_id !== 'number') {
      continue;
    }
    const parsed = parseEntryKind(splitEntryText(entry.text).body);
    if (parsed.kind !== 'quote' || !parsed.body) {
      continue;
    }
    const list = map.get(entry.topic_id) ?? [];
    list.push(parsed.body);
    map.set(entry.topic_id, list);
  }
  return map;
}

/** Difficulty for one book given its quote texts. */
export function difficultyForBook(book: ModelBook, quoteTexts: readonly string[]): DifficultyResult {
  return computeDifficulty({
    genre: book.genre,
    publicationYear: book.publication_year,
    totalPages: book.total_pages,
    quoteTexts,
    override: book.difficulty_override,
    estimate: book.difficulty_estimate,
    estimateConfidence: book.difficulty_estimate_confidence,
  });
}

/** Furthest page position across newest-first entries and sessions. */
export function furthestPage(
  entries: readonly { text: string | null }[],
  sessions: readonly { end_page: number | null }[],
): number {
  let page = 0;
  for (const entry of entries) {
    const boundary = parseProgressBoundaryFromEntryText(entry.text);
    if (boundary && boundary.progressType === 'page') {
      page = Math.max(page, boundary.upper);
    }
  }
  for (const session of sessions) {
    if (typeof session.end_page === 'number') {
      page = Math.max(page, session.end_page);
    }
  }
  return page;
}

export function buildReadingModel<TBook extends ModelBook>(
  input: BuildReadingModelInput<TBook>,
): ReadingModel<TBook> {
  const today = input.today ?? dayKey(new Date());
  const quoteTexts = collectQuoteTextsByBook(input.entries);

  const difficultyByBook = new Map<number, number>();
  const difficultyResults = new Map<number, DifficultyResult>();
  for (const book of input.books) {
    const result = difficultyForBook(book, quoteTexts.get(book.id) ?? []);
    difficultyResults.set(book.id, result);
    difficultyByBook.set(book.id, result.score);
  }

  const activity = buildBookDayActivity({
    entries: input.entries,
    sessions: input.sessions,
    difficultyByBook,
  });
  const loads = aggregateDailyLoad(activity);
  const series = computeFitnessSeries(loads, today);
  const summary = computeProgressSummary({ activity, sessions: input.sessions, loads, today });
  const weekly = computeWeeklyVolume(loads, today, WEEKLY_VOLUME_WEEKS);
  const volume = volumeVersusFourWeekAverage(weekly);
  const heatmap = computeHeatmap(loads, today, HEATMAP_WEEKS);

  const readDays = new Set<string>();
  const readDaysByBook = new Map<number, Set<string>>();
  for (const row of activity) {
    readDays.add(row.day);
    let set = readDaysByBook.get(row.bookId);
    if (!set) {
      set = new Set<string>();
      readDaysByBook.set(row.bookId, set);
    }
    set.add(row.day);
  }
  const streak = computeStreak({ readDays, engagementDays: input.engagementDays.all, today });

  const entriesByBook = new Map<number, ActivityEntry[]>();
  for (const entry of input.entries) {
    if (typeof entry.topic_id !== 'number') {
      continue;
    }
    const list = entriesByBook.get(entry.topic_id) ?? [];
    list.push(entry);
    entriesByBook.set(entry.topic_id, list);
  }
  const sessionsByBook = new Map<number, ActivitySession[]>();
  for (const session of input.sessions) {
    const list = sessionsByBook.get(session.topic_id) ?? [];
    list.push(session);
    sessionsByBook.set(session.topic_id, list);
  }

  const books: BookFitness<TBook>[] = input.books.map((book) => {
    const bookRows = activity.filter((row) => row.bookId === book.id);
    const currentPage = furthestPage(
      entriesByBook.get(book.id) ?? [],
      sessionsByBook.get(book.id) ?? [],
    );
    return {
      book,
      difficulty: difficultyResults.get(book.id)!,
      currentPage,
      trophy: computeTrophyProgress({
        totalPages: book.total_pages,
        currentPage,
        finished: Boolean(book.finished_at),
      }),
      streak: computeStreak({
        readDays: readDaysByBook.get(book.id) ?? new Set<string>(),
        engagementDays: input.engagementDays.byBook.get(book.id) ?? new Set<string>(),
        today,
      }),
      pages: bookRows.reduce((sum, row) => sum + row.pages, 0),
      minutes: Math.round(bookRows.reduce((sum, row) => sum + row.minutes, 0)),
      sessions: bookRows.reduce((sum, row) => sum + row.sessions, 0),
      lastActiveDay: bookRows.length ? bookRows[bookRows.length - 1].day : null,
    };
  });

  const trophyCase = books
    .filter((item) => item.trophy.complete)
    .sort((a, b) => {
      const left = dayKeyFromIso(a.book.finished_at) ?? a.lastActiveDay ?? '';
      const right = dayKeyFromIso(b.book.finished_at) ?? b.lastActiveDay ?? '';
      return left < right ? 1 : left > right ? -1 : 0;
    });
  const trophiesInProgress = books
    .filter((item) => !item.trophy.complete && item.trophy.unlockedCount > 0)
    .sort((a, b) => b.trophy.unlockedCount - a.trophy.unlockedCount);

  return {
    today,
    activity,
    loads,
    series,
    summary,
    weekly,
    volume,
    heatmap,
    streak,
    books,
    trophyCase,
    difficultyByBook,
    trophiesInProgress,
  };
}
