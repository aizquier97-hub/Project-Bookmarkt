import {
  backfillComprehensionScores,
  booksNeedingComprehension,
  buildComprehensionMaterial,
  COMPREHENSION_MAX_CHARS,
  hashComprehensionMaterial,
  resetComprehensionBackfillMemory,
} from '@/domains/fitness/comprehension';
import {
  blendComprehensionFactor,
  buildBookDayActivity,
  COMPREHENSION_MAX,
  COMPREHENSION_MIN,
  computeComprehensionFactor,
} from '@/domains/fitness/activity';
import type { Book } from '@/domains/library/service';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;

function book(id: number, extra: Partial<Book> = {}): Book {
  return {
    id,
    name: `Book ${id}`,
    author: 'Author',
    comprehension_confidence: null,
    comprehension_hash: null,
    comprehension_marks: null,
    comprehension_rationale: null,
    comprehension_score: null,
    comprehension_scored_at: null,
    cover_url: null,
    created_at: null,
    difficulty_estimate: null,
    difficulty_estimate_confidence: null,
    difficulty_estimated_at: null,
    difficulty_override: null,
    difficulty_rationale: null,
    finished_at: null,
    genre: null,
    isbn: null,
    publication_year: null,
    publisher: null,
    total_pages: null,
    user_id: 'user',
    ...extra,
  };
}

function entry(topicId: number, text: string, createdAt: string, reflection: string | null = null) {
  return { topic_id: topicId, text, created_at: createdAt, reflection };
}

beforeEach(() => {
  invoke.mockReset();
  resetComprehensionBackfillMemory();
});

describe('buildComprehensionMaterial', () => {
  it('orders notes oldest first, one per line, with reflections appended', () => {
    const built = buildComprehensionMaterial([
      entry(1, 'page 40  Alyosha  leaves\nthe monastery', '2026-09-02T10:00:00+00:00'),
      entry(1, '[Quote] "Beauty is a terrible thing"', '2026-09-01T10:00:00+00:00', 'Dmitri on  desire'),
    ]);
    expect(built.entryCount).toBe(2);
    expect(built.material).toBe(
      '[Quote] "Beauty is a terrible thing" || Reflection: Dmitri on desire\npage 40 Alyosha leaves the monastery',
    );
  });

  it('breaks ties on the same timestamp by text, deterministically', () => {
    const a = buildComprehensionMaterial([
      entry(1, 'zebra', '2026-09-01T10:00:00+00:00'),
      entry(1, 'apple', '2026-09-01T10:00:00+00:00'),
    ]);
    const b = buildComprehensionMaterial([
      entry(1, 'apple', '2026-09-01T10:00:00+00:00'),
      entry(1, 'zebra', '2026-09-01T10:00:00+00:00'),
    ]);
    expect(a.material).toBe('apple\nzebra');
    expect(b.material).toBe(a.material);
  });

  it('skips empty notes and keeps the newest lines when the cap bites', () => {
    const long = 'x'.repeat(COMPREHENSION_MAX_CHARS - 10);
    const built = buildComprehensionMaterial([
      entry(1, '   ', '2026-09-01T10:00:00+00:00'),
      entry(1, 'old note that will be dropped', '2026-09-02T10:00:00+00:00'),
      entry(1, long, '2026-09-03T10:00:00+00:00'),
      entry(1, 'newest', '2026-09-04T10:00:00+00:00'),
    ]);
    expect(built.entryCount).toBe(2);
    expect(built.material.startsWith(long)).toBe(true);
    expect(built.material.endsWith('\nnewest')).toBe(true);
  });
});

describe('hashComprehensionMaterial', () => {
  it('is the djb2 shape the Edge Function writes', () => {
    expect(hashComprehensionMaterial('')).toBe('djb2:1505:0');
    expect(hashComprehensionMaterial('abc')).toMatch(/^djb2:[0-9a-f]+:3$/);
    expect(hashComprehensionMaterial('abc')).toBe(hashComprehensionMaterial('abc'));
    expect(hashComprehensionMaterial('abc')).not.toBe(hashComprehensionMaterial('abd'));
  });

  it('matches the hash the deployed Edge Function wrote for the same notes', () => {
    // Recorded from a live grading run against the companion function
    // (D-065 smoke test); the server and client builders must agree.
    const notes = [
      'page 12 Fyodor Pavlovich is introduced as a buffoon who neglects his sons; the narrator keeps apologising for him, which makes me trust the narrator less.',
      'page 60 Zosima bows to Dmitri. I think he sees the suffering coming - the bow is to the suffering, not the man. Compare with Myshkin in The Idiot.',
      '[Quote] "Beauty is a terrible and awful thing"',
      "page 112 Ivan's argument about the children: he is not rejecting God, he is returning the ticket. This feels like the real centre of the book, more than the murder.",
      "[Important] page 140 The Grand Inquisitor. Freedom vs bread. Alyosha's kiss answers nothing and everything.",
    ];
    const rows = notes.map((text, i) =>
      entry(
        1,
        text,
        `2026-10-03T21:53:0${i}+00:00`,
        i === 2 ? 'Dmitri on how desire and the ideal live in one heart.' : null,
      ),
    );
    const built = buildComprehensionMaterial(rows);
    expect(built.entryCount).toBe(5);
    expect(hashComprehensionMaterial(built.material)).toBe('djb2:6c2c609c:690');
  });
});

describe('booksNeedingComprehension', () => {
  const entries = [
    entry(1, 'first thought', '2026-09-01T10:00:00+00:00'),
    entry(2, 'another book', '2026-09-01T10:00:00+00:00'),
    entry(3, 'graded already', '2026-09-01T10:00:00+00:00'),
  ];
  const gradedHash = hashComprehensionMaterial(
    buildComprehensionMaterial([entries[2]]).material,
  );

  it('wants unscored books with notes, and books whose notes changed', () => {
    const books = [
      book(1),
      book(2, { comprehension_score: 0.5, comprehension_hash: 'djb2:stale:1' }),
      book(3, { comprehension_score: 0.7, comprehension_hash: gradedHash }),
      book(4),
    ];
    expect(booksNeedingComprehension(books, entries).map((b) => b.id)).toEqual([1, 2]);
  });
});

describe('backfillComprehensionScores', () => {
  const entries = [
    entry(1, 'one', '2026-09-01T10:00:00+00:00'),
    entry(2, 'two', '2026-09-01T10:00:00+00:00'),
    entry(3, 'three', '2026-09-01T10:00:00+00:00'),
  ];

  it('grades up to the limit, one book at a time, and remembers attempts', async () => {
    invoke.mockResolvedValue({
      data: { comprehension: { score: 0.6, confidence: 'medium', rationale: 'ok', cached: false } },
      error: null,
    });
    const books = [book(1), book(2), book(3)];
    expect(await backfillComprehensionScores(books, entries, 2)).toBe(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('companion', {
      body: { feature: 'comprehension', bookId: 1 },
    });

    expect(await backfillComprehensionScores(books, entries, 2)).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(3);

    expect(await backfillComprehensionScores(books, entries, 2)).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('stops the pass on the first failure and does not count unassessed answers', async () => {
    invoke
      .mockResolvedValueOnce({ data: { code: 'NO_ENTRIES', comprehension: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: {} } });
    expect(await backfillComprehensionScores([book(1), book(2), book(3)], entries)).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('blendComprehensionFactor', () => {
  it('returns the behavioural factor untouched without a rubric score', () => {
    expect(blendComprehensionFactor(1.1, null)).toBe(1.1);
  });

  it('averages the two on the unit interval and stretches back to [0.6, 1.4]', () => {
    expect(blendComprehensionFactor(COMPREHENSION_MIN, 0)).toBe(COMPREHENSION_MIN);
    expect(blendComprehensionFactor(COMPREHENSION_MAX, 1)).toBe(COMPREHENSION_MAX);
    // b = (1.0 - 0.6) / 0.8 = 0.5; m = 1 -> C = 0.6 + 0.8 x 0.75 = 1.2
    expect(blendComprehensionFactor(1.0, 1)).toBe(1.2);
    // b = 1; m = 0 -> C = 0.6 + 0.8 x 0.5 = 1.0
    expect(blendComprehensionFactor(COMPREHENSION_MAX, 0)).toBe(1.0);
  });

  it('flows through the activity rows when a book has a score', () => {
    const rows = buildBookDayActivity({
      entries: [entry(7, 'page 10 A note of eighty words or so', '2026-09-01T10:00:00+00:00')],
      sessions: [],
      difficultyByBook: new Map([[7, 5]]),
      comprehensionByBook: new Map([[7, 1]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].modelComprehension).toBe(1);
    const behavioural = computeComprehensionFactor(rows[0]);
    expect(behavioural).toBeGreaterThanOrEqual(1.0);
    expect(rows[0].comprehension).toBe(blendComprehensionFactor(behavioural, 1));
    expect(rows[0].comprehension).toBeGreaterThan(behavioural);
  });
});
