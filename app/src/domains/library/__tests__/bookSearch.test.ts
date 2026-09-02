import {
  normalizeGoogleCoverUrl,
  parseGoogleVolumesPayload,
  parseOpenLibrarySearchPayload,
} from '../bookSearch';

describe('normalizeGoogleCoverUrl', () => {
  it('upgrades http to https and strips the page-curl effect', () => {
    expect(
      normalizeGoogleCoverUrl('http://books.google.com/books/content?id=x&zoom=1&edge=curl'),
    ).toBe('https://books.google.com/books/content?id=x&zoom=1');
  });

  it('leaves https urls untouched', () => {
    expect(normalizeGoogleCoverUrl('https://books.google.com/c?id=x')).toBe(
      'https://books.google.com/c?id=x',
    );
  });

  it('returns null for empty or missing values', () => {
    expect(normalizeGoogleCoverUrl('')).toBeNull();
    expect(normalizeGoogleCoverUrl(undefined)).toBeNull();
    expect(normalizeGoogleCoverUrl('   ')).toBeNull();
  });
});

describe('parseGoogleVolumesPayload', () => {
  const fullItem = {
    id: 'vol1',
    volumeInfo: {
      title: 'Don Quixote',
      authors: ['Miguel de Cervantes', 'Translator Person'],
      publishedDate: '2003-02-25',
      pageCount: 992,
      imageLinks: {
        thumbnail: 'http://books.google.com/books/content?id=vol1&edge=curl',
      },
      industryIdentifiers: [
        { type: 'ISBN_10', identifier: '0142437239' },
        { type: 'ISBN_13', identifier: '9780142437230' },
      ],
    },
  };

  it('maps a full volume to a search result', () => {
    const [result] = parseGoogleVolumesPayload({ items: [fullItem] });
    expect(result).toEqual({
      id: 'vol1',
      title: 'Don Quixote',
      author: 'Miguel de Cervantes',
      year: 2003,
      pages: 992,
      coverUrl: 'https://books.google.com/books/content?id=vol1',
      isbn13: '9780142437230',
      source: 'google-books',
    });
  });

  it('skips items without a title', () => {
    const results = parseGoogleVolumesPayload({
      items: [{ id: 'a', volumeInfo: {} }, fullItem],
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('vol1');
  });

  it('handles missing optional fields with nulls', () => {
    const [result] = parseGoogleVolumesPayload({
      items: [{ id: 'b', volumeInfo: { title: 'Bare Book' } }],
    });
    expect(result).toEqual({
      id: 'b',
      title: 'Bare Book',
      author: null,
      year: null,
      pages: null,
      coverUrl: null,
      isbn13: null,
      source: 'google-books',
    });
  });

  it('ignores an ISBN_13 that fails the checksum', () => {
    const [result] = parseGoogleVolumesPayload({
      items: [
        {
          id: 'c',
          volumeInfo: {
            title: 'Bad Identifier',
            industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780142437231' }],
          },
        },
      ],
    });
    expect(result.isbn13).toBeNull();
  });

  it('caps results at ten volumes', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      volumeInfo: { title: `Book ${i}` },
    }));
    expect(parseGoogleVolumesPayload({ items })).toHaveLength(10);
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseGoogleVolumesPayload(null)).toEqual([]);
    expect(parseGoogleVolumesPayload({})).toEqual([]);
    expect(parseGoogleVolumesPayload({ items: 'nope' })).toEqual([]);
  });
});

describe('parseOpenLibrarySearchPayload', () => {
  it('maps a search doc to a fallback result with a cover url', () => {
    const [result] = parseOpenLibrarySearchPayload({
      docs: [
        {
          key: '/works/OL123W',
          title: 'Don Quixote',
          author_name: ['Miguel de Cervantes'],
          first_publish_year: 1605,
          number_of_pages_median: 992,
          cover_i: 456,
        },
      ],
    });
    expect(result).toEqual({
      id: '/works/OL123W',
      title: 'Don Quixote',
      author: 'Miguel de Cervantes',
      year: 1605,
      pages: 992,
      coverUrl: 'https://covers.openlibrary.org/b/id/456-L.jpg',
      isbn13: null,
      source: 'open-library',
    });
  });

  it('skips docs without a title and handles missing fields', () => {
    const results = parseOpenLibrarySearchPayload({
      docs: [{ cover_i: 1 }, { key: 'k', title: 'Sparse' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'k',
      title: 'Sparse',
      author: null,
      year: null,
      pages: null,
      coverUrl: null,
      isbn13: null,
      source: 'open-library',
    });
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseOpenLibrarySearchPayload(undefined)).toEqual([]);
    expect(parseOpenLibrarySearchPayload({ docs: null })).toEqual([]);
  });
});
