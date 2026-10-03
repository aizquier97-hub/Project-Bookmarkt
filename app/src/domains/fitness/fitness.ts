/**
 * Reading Fitness (D-062): a Strava-style chronic training load for reading.
 *
 *   Fitness_d = Fitness_{d-1} + (Load_d - Fitness_{d-1}) / 42
 *
 * where Load_d is the day's total Session Effort (pages x difficulty weight x
 * comprehension factor, see activity.ts). A 42-day exponentially weighted
 * average means Fitness rises slowly with sustained reading and decays
 * gently through quiet stretches - exactly the "+450% over the past year"
 * story the Strava fitness chart tells. Also computes the dashboard's
 * secondary metrics (volume, pace, endurance, consistency).
 */

import type { ActivitySession, BookDayActivity, DailyLoad } from '@/domains/fitness/activity';
import { sessionPages } from '@/domains/fitness/activity';
import { dayKeyFromIso, dayRange, parseDayKey, shiftDayKey, weekStartKey } from '@/domains/fitness/days';

/** Time constant of the fitness average, in days (Strava's CTL default). */
export const FITNESS_TIME_CONSTANT = 42;

export interface FitnessPoint {
  day: string;
  load: number;
  fitness: number;
}

/**
 * Fitness for every day from the first active day through `today`
 * (inclusive). Returns an empty series when there is no activity.
 */
export function computeFitnessSeries(loads: readonly DailyLoad[], today: string): FitnessPoint[] {
  if (loads.length === 0) {
    return [];
  }
  const loadByDay = new Map(loads.map((load) => [load.day, load.effort]));
  const firstDay = loads.reduce((min, load) => (load.day < min ? load.day : min), loads[0].day);
  const start = firstDay < today ? firstDay : today;
  const series: FitnessPoint[] = [];
  let fitness = 0;
  for (const day of dayRange(start, today)) {
    const load = loadByDay.get(day) ?? 0;
    fitness = fitness + (load - fitness) / FITNESS_TIME_CONSTANT;
    series.push({ day, load, fitness: Math.round(fitness * 100) / 100 });
  }
  return series;
}

export type FitnessRange = '1M' | '3M' | '6M' | '1Y';

export const FITNESS_RANGE_DAYS: Record<FitnessRange, number> = {
  '1M': 30,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};

export interface FitnessTrend {
  current: number;
  /** Fitness at the start of the range (0 when the series is younger). */
  previous: number;
  /** Percent change over the range; null when there was nothing to compare. */
  percentChange: number | null;
  points: FitnessPoint[];
}

export function describeFitnessTrend(series: readonly FitnessPoint[], range: FitnessRange): FitnessTrend {
  if (series.length === 0) {
    return { current: 0, previous: 0, percentChange: null, points: [] };
  }
  const days = FITNESS_RANGE_DAYS[range];
  const points = series.slice(-days);
  const current = series[series.length - 1].fitness;
  const startIndex = series.length - days;
  const previous = startIndex >= 0 ? series[startIndex].fitness : 0;
  const percentChange =
    previous >= 0.5 ? Math.round(((current - previous) / previous) * 100) : null;
  return { current, previous, percentChange, points };
}

export interface WeekVolume {
  /** Monday day key. */
  weekStart: string;
  pages: number;
  effort: number;
  minutes: number;
  readDays: number;
}

/** Pages per week for the last `weeks` weeks, oldest first, current week last. */
export function computeWeeklyVolume(
  loads: readonly DailyLoad[],
  today: string,
  weeks: number,
): WeekVolume[] {
  const currentWeek = weekStartKey(today);
  const buckets = new Map<string, WeekVolume>();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = shiftDayKey(currentWeek, -7 * i);
    buckets.set(weekStart, { weekStart, pages: 0, effort: 0, minutes: 0, readDays: 0 });
  }
  for (const load of loads) {
    const bucket = buckets.get(weekStartKey(load.day));
    if (!bucket) {
      continue;
    }
    bucket.pages += load.pages;
    bucket.effort = Math.round((bucket.effort + load.effort) * 100) / 100;
    bucket.minutes = Math.round((bucket.minutes + load.minutes) * 10) / 10;
    if (load.pages > 0 || load.entries > 0 || load.sessions > 0) {
      bucket.readDays += 1;
    }
  }
  return [...buckets.values()];
}

/**
 * This week's pages against the average of the previous four weeks, the
 * way Strava's profile reports "+18% vs 4-wk avg". Null until there is a
 * baseline to compare against.
 */
export function volumeVersusFourWeekAverage(weekly: readonly WeekVolume[]): {
  thisWeek: number;
  baseline: number | null;
  percentChange: number | null;
} {
  if (weekly.length === 0) {
    return { thisWeek: 0, baseline: null, percentChange: null };
  }
  const thisWeek = weekly[weekly.length - 1].pages;
  const previous = weekly.slice(-5, -1);
  if (previous.length === 0) {
    return { thisWeek, baseline: null, percentChange: null };
  }
  const baseline = previous.reduce((sum, week) => sum + week.pages, 0) / previous.length;
  if (baseline < 1) {
    return { thisWeek, baseline, percentChange: null };
  }
  return {
    thisWeek,
    baseline: Math.round(baseline),
    percentChange: Math.round(((thisWeek - baseline) / baseline) * 100),
  };
}

export interface ProgressSummary {
  /**
   * Pages per minute across timed sessions with a page range, to two
   * decimals (null = none yet). Minutes, not hours, since D-064: a sitting
   * is measured in minutes and "0.8 pages/min" is the number a reader can
   * feel while the glass runs.
   */
  pacePagesPerMinute: number | null;
  /** Average timed session length in minutes (null = no sessions). */
  enduranceMinutes: number | null;
  /** Read days per week over the last 28 days. */
  consistencyDaysPerWeek: number;
  /** Pages-weighted mean Difficulty Index over the last 28 days. */
  averageDifficulty: number | null;
  /** Pages-weighted mean comprehension factor over the last 28 days. */
  averageComprehension: number | null;
  pagesLast28Days: number;
  minutesLast28Days: number;
  totalPages: number;
  totalMinutes: number;
  totalSessions: number;
  totalReadDays: number;
}

const SUMMARY_WINDOW_DAYS = 28;

/** Pace to two decimals; shared by the summary and the timer's wrap-up. */
export function roundPace(pagesPerMinute: number): number {
  return Math.round(pagesPerMinute * 100) / 100;
}

/** Pages per minute for one sitting, or null without a usable page range. */
export function sessionPacePagesPerMinute(pages: number | null, durationSeconds: number): number | null {
  if (pages === null || pages <= 0 || durationSeconds <= 0) {
    return null;
  }
  return roundPace(pages / (durationSeconds / 60));
}

export function computeProgressSummary(input: {
  activity: readonly BookDayActivity[];
  sessions: readonly ActivitySession[];
  loads: readonly DailyLoad[];
  today: string;
}): ProgressSummary {
  const windowStart = shiftDayKey(input.today, -(SUMMARY_WINDOW_DAYS - 1));
  const recentActivity = input.activity.filter((row) => row.day >= windowStart);

  const paceFrom = (sessions: readonly ActivitySession[]): number | null => {
    let pages = 0;
    let seconds = 0;
    for (const session of sessions) {
      const sessionPageCount = sessionPages(session);
      if (sessionPageCount === null || sessionPageCount <= 0 || session.duration_seconds < 60) {
        continue;
      }
      pages += sessionPageCount;
      seconds += session.duration_seconds;
    }
    return seconds > 0 ? roundPace(pages / (seconds / 60)) : null;
  };
  const recentSessions = input.sessions.filter(
    (session) => (dayKeyFromIso(session.started_at) ?? '') >= windowStart,
  );
  const pacePagesPerMinute = paceFrom(recentSessions) ?? paceFrom(input.sessions);

  const enduranceFrom = (sessions: readonly ActivitySession[]): number | null => {
    if (sessions.length === 0) {
      return null;
    }
    const total = sessions.reduce((sum, session) => sum + session.duration_seconds, 0);
    return Math.round(total / sessions.length / 60);
  };
  const enduranceMinutes = enduranceFrom(recentSessions) ?? enduranceFrom(input.sessions);

  const recentLoads = input.loads.filter((load) => load.day >= windowStart);
  const readDays = recentLoads.filter(
    (load) => load.pages > 0 || load.entries > 0 || load.sessions > 0,
  ).length;
  const consistencyDaysPerWeek = Math.round((readDays / (SUMMARY_WINDOW_DAYS / 7)) * 10) / 10;

  let weightedDifficulty = 0;
  let weightedComprehension = 0;
  let weightPages = 0;
  for (const row of recentActivity) {
    weightedDifficulty += row.difficulty * row.pages;
    weightedComprehension += row.comprehension * row.pages;
    weightPages += row.pages;
  }

  return {
    pacePagesPerMinute,
    enduranceMinutes,
    consistencyDaysPerWeek,
    averageDifficulty: weightPages > 0 ? Math.round((weightedDifficulty / weightPages) * 10) / 10 : null,
    averageComprehension:
      weightPages > 0 ? Math.round((weightedComprehension / weightPages) * 100) / 100 : null,
    pagesLast28Days: recentLoads.reduce((sum, load) => sum + load.pages, 0),
    minutesLast28Days: Math.round(recentLoads.reduce((sum, load) => sum + load.minutes, 0)),
    totalPages: input.loads.reduce((sum, load) => sum + load.pages, 0),
    totalMinutes: Math.round(input.loads.reduce((sum, load) => sum + load.minutes, 0)),
    totalSessions: input.sessions.length,
    totalReadDays: input.loads.filter(
      (load) => load.pages > 0 || load.entries > 0 || load.sessions > 0,
    ).length,
  };
}

export interface HeatmapCell {
  day: string;
  /** 0 (nothing) to 4 (top quartile of the reader's own days). */
  level: 0 | 1 | 2 | 3 | 4;
  effort: number;
}

/** Last `weeks` weeks of days (Monday-aligned), with relative intensity levels. */
export function computeHeatmap(loads: readonly DailyLoad[], today: string, weeks: number): HeatmapCell[] {
  const end = today;
  const start = shiftDayKey(weekStartKey(today), -7 * (weeks - 1));
  const loadByDay = new Map(loads.map((load) => [load.day, load.effort]));
  const max = Math.max(0, ...loads.filter((load) => load.day >= start).map((load) => load.effort));
  return dayRange(start, end).map((day) => {
    const effort = loadByDay.get(day) ?? 0;
    let level: HeatmapCell['level'] = 0;
    if (effort > 0 && max > 0) {
      const ratio = effort / max;
      level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
    return { day, level, effort };
  });
}

export type CalendarDayKind = 'read' | 'current' | 'quiet';

export interface CalendarDay {
  day: string;
  kind: CalendarDayKind;
  pages: number;
  minutes: number;
  entries: number;
  sessions: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalendarMonth {
  /** "YYYY-MM". */
  month: string;
  year: number;
  /** 1-12. */
  monthIndex: number;
  /** Nulls pad the first week so the grid starts on Monday. */
  cells: (CalendarDay | null)[];
  readDays: number;
  currentDays: number;
  pages: number;
  minutes: number;
}

/**
 * One month of the reading calendar (D-064): every day of the month marked
 * as read (entry or session), Reading Current (companion engagement only),
 * or quiet, with the month's totals. The grid is Monday-first like the
 * heatmap so the two agree.
 */
export function computeCalendarMonth(input: {
  loads: readonly DailyLoad[];
  engagementDays: ReadonlySet<string>;
  year: number;
  monthIndex: number;
  today: string;
}): CalendarMonth {
  const { year, monthIndex, today } = input;
  const monthKey = `${year}-${String(monthIndex).padStart(2, '0')}`;
  const loadByDay = new Map(input.loads.map((load) => [load.day, load]));
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const first = parseDayKey(`${monthKey}-01`);
  const leading = (first.getDay() + 6) % 7; // Monday = 0
  const cells: (CalendarDay | null)[] = Array.from({ length: leading }, () => null);
  let readDays = 0;
  let currentDays = 0;
  let pages = 0;
  let minutes = 0;
  for (let date = 1; date <= daysInMonth; date++) {
    const day = `${monthKey}-${String(date).padStart(2, '0')}`;
    const load = loadByDay.get(day);
    const read = Boolean(load && (load.pages > 0 || load.entries > 0 || load.sessions > 0));
    const kind: CalendarDayKind = read ? 'read' : input.engagementDays.has(day) ? 'current' : 'quiet';
    if (kind === 'read') {
      readDays += 1;
    } else if (kind === 'current') {
      currentDays += 1;
    }
    pages += load?.pages ?? 0;
    minutes += load?.minutes ?? 0;
    cells.push({
      day,
      kind,
      pages: load?.pages ?? 0,
      minutes: Math.round(load?.minutes ?? 0),
      entries: load?.entries ?? 0,
      sessions: load?.sessions ?? 0,
      isToday: day === today,
      isFuture: day > today,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return {
    month: monthKey,
    year,
    monthIndex,
    cells,
    readDays,
    currentDays,
    pages,
    minutes: Math.round(minutes),
  };
}

/** Shifts a (year, 1-12 month) pair by `delta` months. */
export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const zeroBased = monthIndex - 1 + delta;
  const shiftedYear = year + Math.floor(zeroBased / 12);
  const shiftedMonth = ((zeroBased % 12) + 12) % 12;
  return { year: shiftedYear, monthIndex: shiftedMonth + 1 };
}
