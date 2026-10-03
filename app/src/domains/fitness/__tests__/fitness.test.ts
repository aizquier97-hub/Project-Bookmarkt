import {
  aggregateDailyLoad,
  buildBookDayActivity,
  computeComprehensionFactor,
  computeEffort,
  deriveEntryDeltas,
  estimatePacePagesPerMinute,
  type ActivityEntry,
  type ActivitySession,
} from '@/domains/fitness/activity';
import { dayKey } from '@/domains/fitness/days';
import {
  computeFitnessSeries,
  computeHeatmap,
  computeProgressSummary,
  computeWeeklyVolume,
  describeFitnessTrend,
  volumeVersusFourWeekAverage,
} from '@/domains/fitness/fitness';

function at(day: string, hour = 20): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

function entry(
  bookId: number,
  day: string,
  text: string,
  extra: Partial<ActivityEntry> = {},
): ActivityEntry {
  return { topic_id: bookId, text, created_at: at(day), ...extra };
}

function session(
  bookId: number,
  day: string,
  minutes: number,
  pages: Partial<Pick<ActivitySession, 'start_page' | 'end_page' | 'pages_read'>> = {},
): ActivitySession {
  const started = new Date(at(day, 19));
  const ended = new Date(started.getTime() + minutes * 60_000);
  return {
    topic_id: bookId,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_seconds: minutes * 60,
    start_page: pages.start_page ?? null,
    end_page: pages.end_page ?? null,
    pages_read: pages.pages_read ?? null,
  };
}

describe('comprehension factor and effort', () => {
  it('ranges from 0.6 for a silent session to 1.4 for rich notes', () => {
    expect(
      computeComprehensionFactor({ entries: 0, noteWords: 0, hasImportant: false, hasQuoteReflection: false }),
    ).toBe(0.6);
    expect(
      computeComprehensionFactor({ entries: 1, noteWords: 0, hasImportant: false, hasQuoteReflection: false }),
    ).toBe(1);
    expect(
      computeComprehensionFactor({ entries: 1, noteWords: 40, hasImportant: false, hasQuoteReflection: false }),
    ).toBe(1.1);
    expect(
      computeComprehensionFactor({ entries: 2, noteWords: 200, hasImportant: true, hasQuoteReflection: true }),
    ).toBe(1.4);
  });

  it('weights pages by difficulty around the 5.0 neutral point', () => {
    expect(computeEffort(20, 5, 1)).toBe(20);
    expect(computeEffort(20, 10, 1)).toBe(40);
    expect(computeEffort(20, 2.5, 1.2)).toBe(12);
    expect(computeEffort(-5, 5, 1)).toBe(0);
  });
});

describe('deriveEntryDeltas', () => {
  it('turns boundary headers into page deltas per book, oldest first', () => {
    const deltas = deriveEntryDeltas([
      entry(1, '2026-09-03', '[Manual Entry - page 36-50]\nMore notes here'),
      entry(1, '2026-09-02', '[Manual Entry - page 21-35]\nSome notes'),
      entry(1, '2026-09-01', '[Manual Entry - page 20]\nFirst thoughts'),
      entry(1, '2026-09-04', '[Manual Entry - page 50]\nSame page, no movement'),
    ]);
    expect(deltas.map((d) => d.pages)).toEqual([20, 15, 15, 0]);
    expect(deltas.map((d) => d.day)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('caps the first logged position of a book added mid-read', () => {
    const [delta] = deriveEntryDeltas([entry(2, '2026-09-01', '[Manual Entry - page 250]\nJoined late')]);
    expect(delta.pages).toBe(50);
  });

  it('converts chapter boundaries with the default pages-per-chapter', () => {
    const deltas = deriveEntryDeltas([
      entry(3, '2026-09-01', '[Manual Entry - chapter 2]\nStart'),
      entry(3, '2026-09-02', '[Manual Entry - chapter 3-4]\nNext'),
    ]);
    expect(deltas.map((d) => d.pages)).toEqual([20, 20]);
  });

  it('counts the reader words but not quoted text, and flags reflections', () => {
    const deltas = deriveEntryDeltas([
      entry(1, '2026-09-01', '[Manual Entry - page 10]\n[Quote]\nA very long quoted passage from the book itself goes here.'),
      entry(1, '2026-09-01', '[Manual Entry - page 12]\n[Quote]\nAnother quote.', { reflection: 'This made me think.' }),
      entry(1, '2026-09-01', '[Manual Entry - page 14]\n[Important]\nThe turning point'),
      entry(1, '2026-09-01', 'Legacy entry without a header, five words'),
    ]);
    expect(deltas[0].noteWords).toBe(0);
    expect(deltas[0].isQuoteWithReflection).toBe(false);
    expect(deltas[1].noteWords).toBe(4);
    expect(deltas[1].isQuoteWithReflection).toBe(true);
    expect(deltas[2].isImportant).toBe(true);
    expect(deltas[2].noteWords).toBe(3);
    expect(deltas[3].pages).toBe(0);
    expect(deltas[3].noteWords).toBe(7);
  });
});

describe('buildBookDayActivity', () => {
  it('credits the larger of entry and session pages, never both', () => {
    const rows = buildBookDayActivity({
      entries: [
        entry(1, '2026-09-01', '[Manual Entry - page 20]\nFirst'),
        entry(1, '2026-09-02', '[Manual Entry - page 21-40]\nSecond'),
      ],
      sessions: [session(1, '2026-09-02', 30, { start_page: 20, end_page: 40 })],
      difficultyByBook: new Map([[1, 5]]),
    });
    expect(rows).toHaveLength(2);
    const second = rows[1];
    expect(second.pagesFromEntries).toBe(20);
    expect(second.pagesFromSessions).toBe(20);
    expect(second.pages).toBe(20);
    expect(second.minutes).toBe(30);
    expect(second.comprehension).toBe(1);
    expect(second.effort).toBe(20);
  });

  it('estimates pages for untimed-page sessions from the reader pace', () => {
    const sessions = [
      session(1, '2026-09-01', 20, { pages_read: 20 }), // 1 page/min
      session(1, '2026-09-02', 10),
    ];
    expect(estimatePacePagesPerMinute(sessions)).toBe(1);
    const rows = buildBookDayActivity({ entries: [], sessions, difficultyByBook: new Map() });
    expect(rows[1].pagesFromSessions).toBe(10);
    expect(rows[1].comprehension).toBe(0.6);
    expect(rows[1].effort).toBe(6);
  });

  it('credits a short stretch for a note with no page movement', () => {
    const rows = buildBookDayActivity({
      entries: [entry(1, '2026-09-01', 'Just a thought with no header')],
      sessions: [],
      difficultyByBook: new Map([[1, 8]]),
    });
    expect(rows[0].pages).toBe(5);
    expect(rows[0].comprehension).toBeGreaterThan(1);
    expect(rows[0].effort).toBe(Math.round(5 * 1.6 * rows[0].comprehension * 100) / 100);
  });

  it('aggregates daily load across books', () => {
    const rows = buildBookDayActivity({
      entries: [
        entry(1, '2026-09-01', '[Manual Entry - page 10]\nA'),
        entry(2, '2026-09-01', '[Manual Entry - page 30]\nB'),
      ],
      sessions: [],
      difficultyByBook: new Map([
        [1, 5],
        [2, 10],
      ]),
    });
    const loads = aggregateDailyLoad(rows);
    expect(loads).toHaveLength(1);
    expect(loads[0].pages).toBe(40);
    expect(loads[0].effort).toBe(70);
    expect(loads[0].books).toBe(2);
  });
});

describe('fitness series', () => {
  it('rises toward a steady load and decays when reading stops', () => {
    const loads = Array.from({ length: 84 }, (_, i) => {
      const day = dayKey(new Date(2026, 5, 1 + i));
      return { day, effort: i < 42 ? 42 : 0, pages: 0, minutes: 0, entries: 0, sessions: 0, books: 0 };
    });
    const today = dayKey(new Date(2026, 5, 84));
    const series = computeFitnessSeries(loads, today);
    expect(series).toHaveLength(84);
    expect(series[0].fitness).toBe(1);
    const peak = series[41].fitness;
    expect(peak).toBeGreaterThan(26);
    expect(peak).toBeLessThan(42);
    expect(series[83].fitness).toBeLessThan(peak / 2);
  });

  it('describes a trend over a range', () => {
    const loads = Array.from({ length: 60 }, (_, i) => ({
      day: dayKey(new Date(2026, 0, 1 + i)),
      effort: 20,
      pages: 20,
      minutes: 0,
      entries: 1,
      sessions: 0,
      books: 1,
    }));
    const series = computeFitnessSeries(loads, dayKey(new Date(2026, 0, 60)));
    const trend = describeFitnessTrend(series, '1M');
    expect(trend.points).toHaveLength(30);
    expect(trend.current).toBeGreaterThan(trend.previous);
    expect(trend.percentChange).toBeGreaterThan(0);
    expect(describeFitnessTrend([], '1Y').percentChange).toBeNull();
  });
});

describe('weekly volume and summary', () => {
  const today = '2026-09-30'; // a Wednesday
  const loads = [
    { day: '2026-09-28', effort: 30, pages: 30, minutes: 20, entries: 1, sessions: 1, books: 1 },
    { day: '2026-09-29', effort: 30, pages: 30, minutes: 20, entries: 1, sessions: 1, books: 1 },
    { day: '2026-09-21', effort: 20, pages: 20, minutes: 0, entries: 1, sessions: 0, books: 1 },
    { day: '2026-09-14', effort: 20, pages: 20, minutes: 0, entries: 1, sessions: 0, books: 1 },
    { day: '2026-09-07', effort: 20, pages: 20, minutes: 0, entries: 1, sessions: 0, books: 1 },
    { day: '2026-08-31', effort: 20, pages: 20, minutes: 0, entries: 1, sessions: 0, books: 1 },
  ];

  it('buckets pages into Monday-aligned weeks', () => {
    const weekly = computeWeeklyVolume(loads, today, 6);
    expect(weekly.map((w) => w.weekStart)).toEqual([
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
    expect(weekly.map((w) => w.pages)).toEqual([0, 20, 20, 20, 20, 60]);
    expect(weekly[5].readDays).toBe(2);
  });

  it('compares this week with the previous four-week average', () => {
    const weekly = computeWeeklyVolume(loads, today, 6);
    const volume = volumeVersusFourWeekAverage(weekly);
    expect(volume.thisWeek).toBe(60);
    expect(volume.baseline).toBe(20);
    expect(volume.percentChange).toBe(200);
    expect(volumeVersusFourWeekAverage([]).percentChange).toBeNull();
  });

  it('summarizes pace, endurance, consistency, and difficulty', () => {
    const sessions = [
      session(1, '2026-09-28', 20, { pages_read: 30 }),
      session(1, '2026-09-29', 40, { pages_read: 30 }),
    ];
    const activity = buildBookDayActivity({
      entries: [
        entry(1, '2026-09-28', '[Manual Entry - page 30]\nA'),
        entry(1, '2026-09-29', '[Manual Entry - page 31-60]\nB'),
        entry(2, '2026-09-21', '[Manual Entry - page 20]\nC'),
      ],
      sessions,
      difficultyByBook: new Map([
        [1, 6],
        [2, 3],
      ]),
    });
    const summary = computeProgressSummary({
      activity,
      sessions,
      loads: aggregateDailyLoad(activity),
      today,
    });
    expect(summary.pacePagesPerHour).toBe(60);
    expect(summary.enduranceMinutes).toBe(30);
    expect(summary.consistencyDaysPerWeek).toBe(0.8);
    expect(summary.averageDifficulty).toBe(5.3);
    expect(summary.pagesLast28Days).toBe(80);
    expect(summary.totalSessions).toBe(2);
    expect(summary.totalReadDays).toBe(3);
  });

  it('builds a Monday-aligned heatmap with relative levels', () => {
    const cells = computeHeatmap(loads, today, 2);
    expect(cells[0].day).toBe('2026-09-21');
    expect(cells[cells.length - 1].day).toBe(today);
    expect(cells.find((c) => c.day === '2026-09-28')?.level).toBe(4);
    expect(cells.find((c) => c.day === '2026-09-21')?.level).toBe(3);
    expect(cells.find((c) => c.day === '2026-09-22')?.level).toBe(0);
  });
});
