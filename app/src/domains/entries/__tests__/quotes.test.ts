import { extractQuotes, toQuote } from '@/domains/entries/quotes';

// Only the pure builders are under test; keep the client out of the suite
// (jest.mock calls are hoisted above the imports).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/domains/reporting/analytics', () => ({ trackAnalyticsEvent: jest.fn() }));

const row = (text: string, id = 1) => ({
  id,
  topic_id: 7,
  text,
  created_at: '2026-10-09T10:00:00Z',
  is_favorite: false,
  reflection: null,
});

describe('toQuote (D-062 / D-096)', () => {
  it('lifts the quoted passage and position out of a quote log', () => {
    expect(toQuote(row('[Manual Entry - page 12]\n[Quote]\nAll that is gold does not glitter.')))
      .toEqual({
        entryId: 1,
        bookId: 7,
        body: 'All that is gold does not glitter.',
        boundaryLabel: 'Page 12',
        createdAt: '2026-10-09T10:00:00Z',
        isFavorite: false,
        reflection: null,
      });
  });

  it('keeps the reader\'s formatting - blank lines and spacing - exactly as written', () => {
    const body = 'Not all those who wander are lost.\n\nThe old that is strong does not wither.  Deep roots.';
    const quote = toQuote(row(`[Manual Entry - page 170]\n[Quote]\n${body}`));
    expect(quote?.body).toBe(body);
  });

  it('skips notes, empty quotes, and reflections that are only whitespace', () => {
    expect(toQuote(row('[Manual Entry - page 1]\nJust a note.'))).toBeNull();
    expect(toQuote(row('[Manual Entry - page 1]\n[Quote]\n   '))).toBeNull();
    expect(toQuote({ ...row('[Quote]\nA line.'), reflection: '  ' })?.reflection).toBeNull();
  });

  it('extracts only the quote rows, in the order given', () => {
    const quotes = extractQuotes([
      row('[Quote]\nFirst.', 1),
      row('A plain note.', 2),
      row('[Manual Entry - chapter 3]\n[Quote]\nSecond.', 3),
    ]);
    expect(quotes.map((q) => q.entryId)).toEqual([1, 3]);
    expect(quotes[1].boundaryLabel).toBe('Chapter 3');
  });
});
