import {
  assembleCompanionContext,
  CompanionGroundingError,
  findLatestEntryBoundary,
  type GroundingCharacterRow,
  type GroundingEntryRow,
} from '@/domains/companion/grounding';

const USER = 'user-aaa';
const OTHER_USER = 'user-bbb';
const BOOK = 7;

function entry(overrides: Partial<GroundingEntryRow> = {}): GroundingEntryRow {
  return {
    id: 1,
    user_id: USER,
    topic_id: BOOK,
    text: '[Manual Entry - page 10]\nnote',
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

function character(overrides: Partial<GroundingCharacterRow> = {}): GroundingCharacterRow {
  return {
    id: 1,
    user_id: USER,
    topic_id: BOOK,
    name: 'Quixote',
    description: 'Role: Protagonist',
    ...overrides,
  };
}

describe('assembleCompanionContext grounding guarantees', () => {
  it('builds context only from the requesting user rows with provenance', () => {
    const context = assembleCompanionContext({
      requestingUserId: USER,
      bookId: BOOK,
      entries: [
        entry({ id: 2, created_at: '2026-08-02T10:00:00Z', text: '[Manual Entry - page 11-20]\nb' }),
        entry({ id: 1, created_at: '2026-08-01T10:00:00Z', text: '[Manual Entry - page 10]\na' }),
      ],
      characters: [character()],
      now: new Date('2026-08-21T00:00:00Z'),
    });

    expect(context.provenance).toEqual({
      source: 'user_entries',
      userId: USER,
      bookId: BOOK,
      assembledAt: '2026-08-21T00:00:00.000Z',
      entryIds: [1, 2],
      characterIds: [1],
    });
    // Entries are returned oldest → newest for prompt assembly.
    expect(context.entries.map((item) => item.id)).toEqual([1, 2]);
    expect(context.characters).toEqual([
      { id: 1, name: 'Quixote', description: 'Role: Protagonist' },
    ]);
  });

  it('refuses rows owned by another account', () => {
    expect(() =>
      assembleCompanionContext({
        requestingUserId: USER,
        bookId: BOOK,
        entries: [entry(), entry({ id: 2, user_id: OTHER_USER })],
        characters: [],
      }),
    ).toThrow(CompanionGroundingError);
  });

  it('refuses character rows owned by another account', () => {
    expect(() =>
      assembleCompanionContext({
        requestingUserId: USER,
        bookId: BOOK,
        entries: [],
        characters: [character({ user_id: OTHER_USER })],
      }),
    ).toThrow(CompanionGroundingError);
  });

  it('refuses rows from another book', () => {
    expect(() =>
      assembleCompanionContext({
        requestingUserId: USER,
        bookId: BOOK,
        entries: [entry({ topic_id: BOOK + 1 })],
        characters: [],
      }),
    ).toThrow(CompanionGroundingError);
  });

  it('refuses legacy rows with a null owner', () => {
    expect(() =>
      assembleCompanionContext({
        requestingUserId: USER,
        bookId: BOOK,
        entries: [entry({ user_id: null })],
        characters: [],
      }),
    ).toThrow(CompanionGroundingError);
  });

  it('applies the latest-entry boundary regardless of input order', () => {
    const context = assembleCompanionContext({
      requestingUserId: USER,
      bookId: BOOK,
      entries: [
        entry({ id: 1, created_at: '2026-08-01T10:00:00Z', text: '[Manual Entry - page 10]\na' }),
        entry({
          id: 3,
          created_at: '2026-08-03T10:00:00Z',
          text: 'freeform note without header',
        }),
        entry({
          id: 2,
          created_at: '2026-08-02T10:00:00Z',
          text: '[Manual Entry - page 11-42]\nb',
        }),
      ],
      characters: [],
    });

    // Newest entry has no header, so the boundary comes from the next newest.
    expect(context.boundary).toEqual({ progressType: 'page', lower: 11, upper: 42 });
    expect(context.boundaryLabel).toBe('page 42');
  });

  it('reports a null boundary when no entry has a progress header', () => {
    const context = assembleCompanionContext({
      requestingUserId: USER,
      bookId: BOOK,
      entries: [entry({ text: 'no header at all' })],
      characters: [],
    });
    expect(context.boundary).toBeNull();
    expect(context.boundaryLabel).toBeNull();
  });
});

describe('findLatestEntryBoundary', () => {
  it('uses created_at ordering, not array order', () => {
    expect(
      findLatestEntryBoundary([
        { text: '[Manual Entry - chapter 2]', created_at: '2026-08-01T00:00:00Z' },
        { text: '[Manual Entry - chapter 9]', created_at: '2026-08-05T00:00:00Z' },
      ]),
    ).toEqual({ progressType: 'chapter', lower: null, upper: 9 });
  });

  it('returns null for empty input', () => {
    expect(findLatestEntryBoundary([])).toBeNull();
  });
});
