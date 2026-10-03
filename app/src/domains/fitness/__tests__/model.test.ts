import { buildReadingModel, groupTrophyCase, type ModelBook } from '@/domains/fitness/model';

function book(id: number, overrides: Partial<ModelBook> = {}): ModelBook {
  return {
    id,
    name: `Book ${id}`,
    author: null,
    cover_url: null,
    genre: null,
    publication_year: null,
    total_pages: 100,
    finished_at: null,
    difficulty_override: null,
    difficulty_estimate: null,
    difficulty_estimate_confidence: null,
    ...overrides,
  };
}

function at(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 20, 0, 0).toISOString();
}

describe('buildReadingModel (D-064 additions)', () => {
  const today = '2026-09-30';
  const books = [
    book(1, { finished_at: at('2026-09-10'), difficulty_override: 2 }),
    book(2, { finished_at: at('2026-09-20'), difficulty_override: 8.5 }),
    book(3, { finished_at: at('2026-09-25'), difficulty_override: 3 }),
    book(4), // reading, halfway
    book(5), // reading, nothing logged
  ];
  const model = buildReadingModel({
    books,
    entries: [
      { topic_id: 4, text: '[Manual Entry - page 50]\nHalfway', created_at: at('2026-09-29') },
      { topic_id: 1, text: '[Manual Entry - page 100]\nDone', created_at: at('2026-09-10') },
    ],
    sessions: [],
    engagementDays: { all: new Set(['2026-09-28']), byBook: new Map() },
    today,
  });

  it('shelves the trophy case by difficulty band, every band present', () => {
    expect(model.trophyGroups.map((group) => group.label)).toEqual([
      'Light',
      'Moderate',
      'Demanding',
      'Dense',
    ]);
    const light = model.trophyGroups[0];
    expect(light.items.map((item) => item.book.id)).toEqual([3, 1]);
    expect(model.trophyGroups[1].items).toHaveLength(0);
    expect(model.trophyGroups[3].items.map((item) => item.book.id)).toEqual([2]);
  });

  it('lists every unfinished book as in progress, most recently active first', () => {
    expect(model.booksInProgress.map((item) => item.book.id)).toEqual([4, 5]);
    expect(model.trophiesInProgress.map((item) => item.book.id)).toEqual([4]);
  });

  it('exposes read and engagement days for the calendar', () => {
    expect([...model.readDays].sort()).toEqual(['2026-09-10', '2026-09-29']);
    expect(model.engagementDays.has('2026-09-28')).toBe(true);
  });

  it('groups an empty case into four empty shelves', () => {
    expect(groupTrophyCase([]).every((group) => group.items.length === 0)).toBe(true);
  });
});
