import type { BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import {
  computeCompletionPercent,
  shelfTitleTypography,
  sortBooksForShelf,
} from '@/domains/library/shelf';

function book(partial: Partial<Book>): Book {
  return partial as Book;
}

function summary(lastEntryAt: string | null): BookPositionSummary {
  return { lastEntryAt, position: null };
}

describe('computeCompletionPercent', () => {
  it('returns 100 for finished books regardless of position', () => {
    expect(computeCompletionPercent(null, null, true)).toBe(100);
    expect(
      computeCompletionPercent({ progressType: 'page', lower: null, upper: 10 }, 400, true),
    ).toBe(100);
  });

  it('computes a rounded percent from a page position and total pages', () => {
    expect(
      computeCompletionPercent({ progressType: 'page', lower: null, upper: 90 }, 300, false),
    ).toBe(30);
    expect(
      computeCompletionPercent({ progressType: 'page', lower: 80, upper: 123 }, 456, false),
    ).toBe(27);
  });

  it('clamps overshoot to 100', () => {
    expect(
      computeCompletionPercent({ progressType: 'page', lower: null, upper: 510 }, 500, false),
    ).toBe(100);
  });

  it('returns null without a page position or total pages', () => {
    expect(computeCompletionPercent(null, 300, false)).toBeNull();
    expect(
      computeCompletionPercent({ progressType: 'chapter', lower: null, upper: 4 }, 300, false),
    ).toBeNull();
    expect(
      computeCompletionPercent({ progressType: 'page', lower: null, upper: 90 }, null, false),
    ).toBeNull();
    expect(
      computeCompletionPercent({ progressType: 'page', lower: null, upper: 90 }, 0, false),
    ).toBeNull();
  });
});

describe('sortBooksForShelf', () => {
  it('puts the most recently touched active book first', () => {
    const books = [
      book({ id: 1, created_at: '2026-01-01T00:00:00Z', finished_at: null }),
      book({ id: 2, created_at: '2026-01-02T00:00:00Z', finished_at: null }),
      book({ id: 3, created_at: '2026-01-03T00:00:00Z', finished_at: null }),
    ];
    const summaries = new Map([
      [1, summary('2026-08-20T10:00:00Z')],
      [2, summary('2026-08-22T10:00:00Z')],
    ]);
    const sorted = sortBooksForShelf(books, summaries);
    expect(sorted.map((b) => b.id)).toEqual([2, 1, 3]);
  });

  it('orders untouched books by newest added', () => {
    const books = [
      book({ id: 1, created_at: '2026-01-01T00:00:00Z', finished_at: null }),
      book({ id: 2, created_at: '2026-03-01T00:00:00Z', finished_at: null }),
    ];
    const sorted = sortBooksForShelf(books, new Map());
    expect(sorted.map((b) => b.id)).toEqual([2, 1]);
  });

  it('moves finished books after active ones, newest finish first', () => {
    const books = [
      book({ id: 1, created_at: '2026-01-01T00:00:00Z', finished_at: '2026-08-01T00:00:00Z' }),
      book({ id: 2, created_at: '2026-01-02T00:00:00Z', finished_at: null }),
      book({ id: 3, created_at: '2026-01-03T00:00:00Z', finished_at: '2026-08-15T00:00:00Z' }),
    ];
    const summaries = new Map([
      [1, summary('2026-08-22T10:00:00Z')],
      [3, summary('2026-08-23T10:00:00Z')],
    ]);
    const sorted = sortBooksForShelf(books, summaries);
    expect(sorted.map((b) => b.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate the input array', () => {
    const books = [
      book({ id: 1, created_at: '2026-01-01T00:00:00Z', finished_at: null }),
      book({ id: 2, created_at: '2026-01-02T00:00:00Z', finished_at: null }),
    ];
    sortBooksForShelf(books, new Map());
    expect(books.map((b) => b.id)).toEqual([1, 2]);
  });
});

describe('shelfTitleTypography', () => {
  it('keeps titles with normal words at full size', () => {
    expect(shelfTitleTypography('Don Quixote')).toEqual({
      fontSize: 15,
      lineHeight: 20,
      maxLines: 3,
    });
  });

  it('steps down for longer words so they never break mid-word', () => {
    expect(shelfTitleTypography('Metamorphosis').fontSize).toBe(13);
    expect(shelfTitleTypography('Uncharacteristic').fontSize).toBe(11);
  });

  it('steps down for long overall titles even when every word is short', () => {
    expect(shelfTitleTypography('The Name of the Wind').fontSize).toBe(13);
    expect(shelfTitleTypography('The Brothers Karamazov').fontSize).toBe(13);
    expect(shelfTitleTypography('One Hundred Years of Solitude')).toEqual({
      fontSize: 11,
      lineHeight: 15,
      maxLines: 3,
    });
    expect(shelfTitleTypography('A Counterrevolutionary Tale').fontSize).toBe(11);
  });

  it('ellipsizes a single extreme word on one line instead of splitting it', () => {
    expect(shelfTitleTypography('Supercalifragilisticexpialidocious')).toEqual({
      fontSize: 11,
      lineHeight: 15,
      maxLines: 1,
    });
  });

  it('keeps multiple lines when an extreme word has company', () => {
    expect(shelfTitleTypography('The Supercalifragilisticexpialidocious Story').maxLines).toBe(3);
  });
});
