import { collectEngagementDays, computeStreak } from '@/domains/fitness/streaks';
import {
  computeTrophyProgress,
  newlyUnlockedSegments,
  segmentThreshold,
  trophyUnlockMessage,
} from '@/domains/fitness/trophies';

describe('computeStreak', () => {
  const today = '2026-09-30';

  it('counts consecutive read days ending today', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']),
      engagementDays: new Set(),
      today,
    });
    expect(result.current).toBe(4);
    expect(result.state).toBe('active');
    expect(result.readToday).toBe(true);
    expect(result.startedOn).toBe('2026-09-27');
    expect(result.longest).toBe(4);
  });

  it('keeps the streak alive through today when yesterday was read', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-28', '2026-09-29']),
      engagementDays: new Set(),
      today,
    });
    expect(result.current).toBe(2);
    expect(result.state).toBe('at_risk');
  });

  it('bridges quiet days with companion engagement without counting them', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-25', '2026-09-26', '2026-09-29']),
      engagementDays: new Set(['2026-09-27', '2026-09-28', '2026-09-30']),
      today,
    });
    expect(result.current).toBe(3);
    expect(result.freezesUsed).toBe(3);
    expect(result.state).toBe('frozen');
  });

  it('breaks after more than two consecutive frozen days', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-24', '2026-09-25']),
      engagementDays: new Set(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']),
      today,
    });
    expect(result.current).toBe(0);
    expect(result.state).toBe('none');
    expect(result.freezesUsed).toBe(0);
    expect(result.longest).toBe(2);
  });

  it('breaks on a plain quiet day', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-28', '2026-09-29']),
      engagementDays: new Set(),
      today,
    });
    expect(result.current).toBe(2);
    expect(result.longest).toBe(3);
  });

  it('is over once yesterday was neither read nor engaged', () => {
    const result = computeStreak({
      readDays: new Set(['2026-09-27', '2026-09-28']),
      engagementDays: new Set(),
      today,
    });
    expect(result.current).toBe(0);
    expect(result.state).toBe('none');
    expect(result.longest).toBe(2);
  });

  it('reports no streak for an empty history', () => {
    const result = computeStreak({ readDays: new Set(), engagementDays: new Set(), today });
    expect(result).toMatchObject({ current: 0, longest: 0, state: 'none', startedOn: null });
  });

  it('collects engagement days overall and per book', () => {
    const { all, byBook } = collectEngagementDays(
      [
        { created_at: '2026-09-01T10:00:00Z', topic_id: 1 },
        { created_at: '2026-09-02T10:00:00Z', topic_id: null },
        { created_at: null, topic_id: 2 },
      ],
      (iso) => (iso ? iso.slice(0, 10) : null),
    );
    expect([...all]).toEqual(['2026-09-01', '2026-09-02']);
    expect([...(byBook.get(1) ?? [])]).toEqual(['2026-09-01']);
    expect(byBook.has(2)).toBe(false);
  });
});

describe('trophies', () => {
  it('splits a book into four thresholds', () => {
    expect([1, 2, 3, 4].map((i) => segmentThreshold(100, i))).toEqual([25, 50, 75, 100]);
    expect([1, 2, 3, 4].map((i) => segmentThreshold(301, i))).toEqual([76, 151, 226, 301]);
  });

  it('unlocks pieces as the reader crosses each quarter', () => {
    const progress = computeTrophyProgress({ totalPages: 100, currentPage: 60, finished: false });
    expect(progress.eligible).toBe(true);
    expect(progress.unlockedCount).toBe(2);
    expect(progress.complete).toBe(false);
    expect(progress.pagesToNext).toBe(15);
    expect(progress.segmentFraction).toBeCloseTo(0.4, 5);
  });

  it('completes on the last page or when the book is marked finished', () => {
    expect(computeTrophyProgress({ totalPages: 100, currentPage: 100, finished: false }).complete).toBe(true);
    const finished = computeTrophyProgress({ totalPages: 100, currentPage: 10, finished: true });
    expect(finished.complete).toBe(true);
    expect(finished.unlockedCount).toBe(4);
    expect(finished.pagesToNext).toBeNull();
  });

  it('needs a page count unless the book is finished', () => {
    const open = computeTrophyProgress({ totalPages: null, currentPage: 80, finished: false });
    expect(open.eligible).toBe(false);
    expect(open.unlockedCount).toBe(0);
    const done = computeTrophyProgress({ totalPages: null, currentPage: 0, finished: true });
    expect(done.complete).toBe(true);
  });

  it('detects newly unlocked pieces and words the celebration', () => {
    const before = computeTrophyProgress({ totalPages: 200, currentPage: 40, finished: false });
    const after = computeTrophyProgress({ totalPages: 200, currentPage: 110, finished: false });
    const unlocked = newlyUnlockedSegments(before, after);
    expect(unlocked.map((s) => s.index)).toEqual([1, 2]);
    expect(trophyUnlockMessage('Dune', unlocked)).toBe(
      'Trophy piece 2 of 4 unlocked - halfway of Dune.',
    );
    const done = computeTrophyProgress({ totalPages: 200, currentPage: 200, finished: false });
    expect(trophyUnlockMessage('Dune', newlyUnlockedSegments(after, done))).toBe(
      'Trophy complete: Dune joins your trophy case.',
    );
    expect(newlyUnlockedSegments(after, after)).toEqual([]);
  });
});
