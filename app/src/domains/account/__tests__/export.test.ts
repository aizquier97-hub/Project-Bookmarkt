import { buildExportPayload, serializeExport } from '../export';

// Only the pure builders are under test; keep the client out of the suite
// (jest.mock calls are hoisted above the imports).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const books = [
  {
    id: 1,
    name: 'Dune',
    author: 'Frank Herbert',
    genre: 'Science fiction',
    isbn: '9780441172719',
    finished_at: null,
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Emma',
    author: 'Jane Austen',
    genre: null,
    isbn: null,
    finished_at: '2026-08-20T00:00:00Z',
    created_at: '2026-08-02T00:00:00Z',
  },
];

const entries = [
  {
    id: 10,
    topic_id: 1,
    text: '[Manual Entry - Aug 3]\nPaul meets the Fremen.',
    raw_transcript: null,
    created_at: '2026-08-03T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
  },
  {
    id: 11,
    topic_id: 2,
    text: '[Manual Entry - Aug 4]\nHarriet declines the proposal.',
    raw_transcript: 'harriet declines the proposal',
    created_at: '2026-08-04T00:00:00Z',
    updated_at: '2026-08-04T00:00:00Z',
  },
  {
    id: 12,
    topic_id: null,
    text: 'Orphan row without a book.',
    raw_transcript: null,
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
  },
];

const characters = [
  {
    id: 20,
    topic_id: 1,
    name: 'Paul Atreides',
    description: 'Heir of House Atreides.',
    created_at: '2026-08-03T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
  },
];

const bookmarks = [
  { code: 'BM-0001', topic_id: 1, claimed_at: '2026-08-02T00:00:00Z', linked_at: '2026-08-02T00:00:00Z' },
  { code: 'BM-0002', topic_id: null, claimed_at: '2026-08-06T00:00:00Z', linked_at: null },
];

describe('buildExportPayload', () => {
  const payload = buildExportPayload({
    email: 'reader@example.com',
    exportedAt: '2026-09-02T12:00:00Z',
    books,
    entries,
    characters,
    bookmarks,
  });

  it('counts every raw row, including orphans', () => {
    expect(payload.counts).toEqual({ books: 2, entries: 3, characters: 1, bookmarks: 2 });
  });

  it('nests entries and characters under their book', () => {
    expect(payload.books[0].title).toBe('Dune');
    expect(payload.books[0].entries).toHaveLength(1);
    expect(payload.books[0].entries[0].text).toContain('Paul meets the Fremen');
    expect(payload.books[0].characters[0].name).toBe('Paul Atreides');
    expect(payload.books[1].entries[0].voice_transcript).toBe('harriet declines the proposal');
    expect(payload.books[1].characters).toHaveLength(0);
  });

  it('resolves bookmark links to book titles and keeps unlinked codes', () => {
    expect(payload.bookmarks[0]).toMatchObject({ code: 'BM-0001', linked_book_title: 'Dune' });
    expect(payload.bookmarks[1]).toMatchObject({ code: 'BM-0002', linked_book_title: null });
  });

  it('records the account and export moment', () => {
    expect(payload.account_email).toBe('reader@example.com');
    expect(payload.exported_at).toBe('2026-09-02T12:00:00Z');
    expect(payload.format).toBe('bookmarkt-export');
  });

  it('serializes to parseable JSON', () => {
    const parsed = JSON.parse(serializeExport(payload));
    expect(parsed.version).toBe(1);
    expect(parsed.books).toHaveLength(2);
  });
});
