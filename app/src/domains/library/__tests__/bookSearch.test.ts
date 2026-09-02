import {
  coverCandidatesFromSearchResults,
  enlargeCoverUrl,
  extractPrimaryGenre,
  isbn10To13,
  joinTitleAndSubtitle,
  lookupPagesForTitle,
  normalizeGoogleCoverUrl,
  parseGoogleVolumesPayload,
  parseOpenLibrarySearchPayload,
  pickPagesForTitle,
  pickVolumeMatchingIsbn,
  type BookSearchResult,
} from '../bookSearch';

function result(overrides: Partial<BookSearchResult>): BookSearchResult {
  return {
    id: 'x',
    title: 'Untitled',
    author: null,
    year: null,
    pages: null,
    coverUrl: null,
    isbn13: null,
    genre: null,
    source: 'google-books',
    ...overrides,
  };
}

describe('joinTitleAndSubtitle', () => {
  it('appends a distinguishing subtitle', () => {
    expect(joinTitleAndSubtitle('Sword art online', 'Progressive')).toBe(
      'Sword art online: Progressive',
    );
  });

  it('skips a subtitle already contained in the title', () => {
    expect(joinTitleAndSubtitle('Sword Art Online Progressive 1', 'progressive 1')).toBe(
      'Sword Art Online Progressive 1',
    );
  });

  it('ignores empty and missing subtitles', () => {
    expect(joinTitleAndSubtitle('Dune', '')).toBe('Dune');
    expect(joinTitleAndSubtitle('Dune', undefined)).toBe('Dune');
  });
});

describe('isbn10To13', () => {
  it('converts an ISBN-10 to its EAN-13 form', () => {
    expect(isbn10To13('0316259365')).toBe('9780316259361');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
  });

  it('rejects malformed input', () => {
    expect(isbn10To13('12345')).toBeNull();
    expect(isbn10To13('9780316259361')).toBeNull();
  });
});

describe('pickVolumeMatchingIsbn', () => {
  const vol1 = result({ id: 'v1', title: 'Vol 1', isbn13: '9780316259361' });
  const vol2 = result({ id: 'v2', title: 'Vol 2', isbn13: '9780316342179' });

  it('picks the exact volume even when a sibling leads the results', () => {
    expect(pickVolumeMatchingIsbn([vol2, vol1], '9780316259361')).toBe(vol1);
  });

  it('returns null when no result carries the scanned ISBN', () => {
    expect(pickVolumeMatchingIsbn([vol2], '9780316259361')).toBeNull();
    expect(pickVolumeMatchingIsbn([], '9780316259361')).toBeNull();
  });

  it('matches an ISBN-10 against ISBN-13 identifiers', () => {
    expect(pickVolumeMatchingIsbn([vol2, vol1], '0316259365')).toBe(vol1);
  });
});

describe('pickPagesForTitle', () => {
  const exact = result({ title: 'Sword Art Online: Progressive, Vol. 1', pages: 248 });
  const sibling = result({ title: 'Sword Art Online: Progressive, Vol. 2', pages: 320 });

  it('requires an exact normalized title match', () => {
    const results = [sibling, exact];
    expect(pickPagesForTitle(results, 'sword art online progressive vol 1')).toBe(248);
    expect(pickPagesForTitle(results, 'sword art online progressive')).toBeNull();
  });

  it('prefers the candidate whose author matches', () => {
    const a = result({ title: 'Dune', author: 'Frank Herbert', pages: 412 });
    const b = result({ title: 'Dune', author: 'Someone Else', pages: 200 });
    expect(pickPagesForTitle([b, a], 'Dune', 'Frank Herbert')).toBe(412);
  });

  it('ignores matches without a page count', () => {
    expect(pickPagesForTitle([result({ title: 'Dune' })], 'Dune')).toBeNull();
  });
});

describe('enlargeCoverUrl', () => {
  it('bumps a Google thumbnail to the medium rendition', () => {
    expect(enlargeCoverUrl('https://books.google.com/books/content?id=x&zoom=1&img=1')).toBe(
      'https://books.google.com/books/content?id=x&zoom=2&img=1',
    );
    expect(enlargeCoverUrl('https://books.google.com/books/content?id=x&img=1&zoom=1')).toBe(
      'https://books.google.com/books/content?id=x&img=1&zoom=2',
    );
  });

  it('passes non-Google and non-thumbnail URLs through unchanged', () => {
    const openLibrary = 'https://covers.openlibrary.org/b/id/123-L.jpg';
    expect(enlargeCoverUrl(openLibrary)).toBe(openLibrary);
    const alreadyMedium = 'https://books.google.com/books/content?id=x&zoom=2';
    expect(enlargeCoverUrl(alreadyMedium)).toBe(alreadyMedium);
  });
});

describe('coverCandidatesFromSearchResults', () => {
  it('keeps results with covers, dedupes by URL, and maps fields', () => {
    const withCover = result({
      title: 'Dune',
      author: 'Frank Herbert',
      year: 1965,
      pages: 412,
      coverUrl: 'https://books.google.com/x',
    });
    const duplicate = result({ title: 'Dune (reissue)', coverUrl: 'https://books.google.com/x' });
    const coverless = result({ title: 'Dune Messiah' });
    const candidates = coverCandidatesFromSearchResults([withCover, duplicate, coverless]);
    expect(candidates).toEqual([
      {
        previewUrl: 'https://books.google.com/x',
        coverUrl: 'https://books.google.com/x',
        title: 'Dune',
        author: 'Frank Herbert',
        year: 1965,
        pagesMedian: 412,
      },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(coverCandidatesFromSearchResults([])).toEqual([]);
  });
});

describe('lookupPagesForTitle', () => {
  const volume = (title: string, pageCount: number, author = 'Reki Kawahara') => ({
    id: 'g1',
    volumeInfo: { title, pageCount, authors: [author] },
  });
  const payload = (items: unknown[]) => ({
    ok: true,
    json: async () => ({ items }),
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries title-only when the author-filtered query has no pages', async () => {
    // Seen live: the inauthor: query returns a pageCount-0 edition while
    // the title-only query carries the real count.
    const title = 'Sword Art Online Progressive 1 (light novel)';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(payload([volume(title, 0)]))
      .mockResolvedValueOnce(payload([volume(title, 340)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupPagesForTitle(title, 'Reki Kawahara')).resolves.toBe(340);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('inauthor');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('inauthor');
  });

  it('returns the author-filtered pages without a second request', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(payload([volume('Dune', 412, 'Frank Herbert')]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupPagesForTitle('Dune', 'Frank Herbert')).resolves.toBe(412);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when neither query has an exact match with pages', async () => {
    const fetchMock = jest.fn().mockResolvedValue(payload([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(lookupPagesForTitle('Dune', 'Frank Herbert')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

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
      categories: ['Fiction / Classics'],
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
      genre: 'Fiction / Classics',
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
      genre: null,
      source: 'google-books',
    });
  });

  it('extracts the first category as the genre and ignores junk', () => {
    const [result] = parseGoogleVolumesPayload({
      items: [
        {
          id: 'g',
          volumeInfo: { title: 'Genre Book', categories: ['  Fiction / Fantasy  ', 'Other'] },
        },
      ],
    });
    expect(result.genre).toBe('Fiction / Fantasy');
    expect(extractPrimaryGenre('not-an-array')).toBeNull();
    expect(extractPrimaryGenre([])).toBeNull();
    expect(extractPrimaryGenre(['   '])).toBeNull();
    expect(extractPrimaryGenre(['x'.repeat(300)])).toHaveLength(120);
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

  it('merges a series subtitle into the title', () => {
    const [result] = parseGoogleVolumesPayload({
      items: [
        {
          id: 's',
          volumeInfo: { title: 'Sword Art Online Progressive', subtitle: 'Vol. 3' },
        },
      ],
    });
    expect(result.title).toBe('Sword Art Online Progressive: Vol. 3');
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
      genre: null,
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
      genre: null,
      source: 'open-library',
    });
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseOpenLibrarySearchPayload(undefined)).toEqual([]);
    expect(parseOpenLibrarySearchPayload({ docs: null })).toEqual([]);
  });
});
