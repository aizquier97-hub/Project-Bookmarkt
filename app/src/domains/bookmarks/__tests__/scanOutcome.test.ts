import { bookmarkScanOutcome } from '@/domains/bookmarks/scanOutcome';

describe('bookmarkScanOutcome', () => {
  it('waits for the lookup to settle', () => {
    expect(bookmarkScanOutcome({ pending: true, error: false, bookmark: null })).toBeNull();
  });

  it('reports a failed lookup', () => {
    expect(bookmarkScanOutcome({ pending: false, error: true, bookmark: null })).toBe('error');
  });

  it('walks the setup steps in order', () => {
    expect(bookmarkScanOutcome({ pending: false, error: false, bookmark: null })).toBe(
      'unregistered',
    );
    expect(
      bookmarkScanOutcome({
        pending: false,
        error: false,
        bookmark: { user_id: null, topic_id: null },
      }),
    ).toBe('unclaimed');
    expect(
      bookmarkScanOutcome({
        pending: false,
        error: false,
        bookmark: { user_id: 'u1', topic_id: null },
      }),
    ).toBe('unlinked');
  });

  it('opens the book when everything is linked', () => {
    expect(
      bookmarkScanOutcome({
        pending: false,
        error: false,
        bookmark: { user_id: 'u1', topic_id: 42 },
      }),
    ).toBe('opened_book');
  });
});
