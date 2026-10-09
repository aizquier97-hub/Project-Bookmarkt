import { bookSearchStatus, manualAddReason } from '@/domains/library/addBookSignals';

describe('manualAddReason', () => {
  const base = { searchError: false, queryLength: 5, minQueryLength: 2, resultCount: 3, searching: false };

  it('reports a failed search first', () => {
    expect(manualAddReason({ ...base, searchError: true, resultCount: 0 })).toBe('search_error');
  });

  it('is direct when nothing searchable was typed', () => {
    expect(manualAddReason({ ...base, queryLength: 0 })).toBe('direct');
    expect(manualAddReason({ ...base, queryLength: 1 })).toBe('direct');
  });

  it('is direct while a search is still in flight', () => {
    expect(manualAddReason({ ...base, searching: true, resultCount: 0 })).toBe('direct');
  });

  it('separates empty results from rejected ones', () => {
    expect(manualAddReason({ ...base, resultCount: 0 })).toBe('zero_results');
    expect(manualAddReason({ ...base, resultCount: 2 })).toBe('results_rejected');
  });
});

describe('bookSearchStatus', () => {
  it('classifies by count only', () => {
    expect(bookSearchStatus(0)).toBe('zero_results');
    expect(bookSearchStatus(1)).toBe('results');
  });
});
