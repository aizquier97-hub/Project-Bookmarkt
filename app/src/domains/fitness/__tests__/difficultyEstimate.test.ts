import {
  backfillDifficultyEstimates,
  booksNeedingEstimate,
  requestDifficultyEstimate,
  resetBackfillMemory,
} from '@/domains/fitness/difficultyEstimate';
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
    story_recap: null,
    story_recap_at: null,
    story_recap_hash: null,
    story_recap_range: null,
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

beforeEach(() => {
  invoke.mockReset();
  resetBackfillMemory();
});

describe('requestDifficultyEstimate', () => {
  it('invokes the book-difficulty function and normalizes the payload', async () => {
    invoke.mockResolvedValue({
      data: { difficulty: 8.5, confidence: 'high', rationale: 'Dense theology.', cached: false },
      error: null,
    });
    const result = await requestDifficultyEstimate(42);
    expect(invoke).toHaveBeenCalledWith('book-difficulty', { body: { bookId: 42 } });
    expect(result).toEqual({
      difficulty: 8.5,
      confidence: 'high',
      rationale: 'Dense theology.',
      cached: false,
    });
  });

  it('surfaces the server error message', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: { json: async () => ({ error: 'Daily difficulty limit reached.' }) },
      },
    });
    await expect(requestDifficultyEstimate(1)).rejects.toThrow('Daily difficulty limit reached.');
  });
});

describe('booksNeedingEstimate', () => {
  it('skips rated books and books with a reader override', () => {
    const books = [
      book(1),
      book(2, { difficulty_estimate: 6 }),
      book(3, { difficulty_override: 7 }),
      book(4),
    ];
    expect(booksNeedingEstimate(books).map((b) => b.id)).toEqual([1, 4]);
  });
});

describe('backfillDifficultyEstimates', () => {
  it('rates up to the limit, one book at a time, and remembers attempts', async () => {
    invoke.mockResolvedValue({ data: { difficulty: 5, confidence: 'medium' }, error: null });
    const books = [book(1), book(2), book(3)];
    expect(await backfillDifficultyEstimates(books, 2)).toBe(2);
    expect(invoke).toHaveBeenCalledTimes(2);

    // Second pass in the same launch only touches the book not yet tried.
    expect(await backfillDifficultyEstimates(books, 2)).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(3);

    expect(await backfillDifficultyEstimates(books, 2)).toBe(0);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('stops the pass on the first failure', async () => {
    invoke
      .mockResolvedValueOnce({ data: { difficulty: 4 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { context: {} } });
    expect(await backfillDifficultyEstimates([book(1), book(2), book(3)])).toBe(1);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
