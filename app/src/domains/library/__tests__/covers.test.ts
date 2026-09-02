import {
  coverUrlForId,
  normalizeIsbn,
  parseCoverSearchPayload,
  parseIsbnPayload,
} from '../covers';

describe('normalizeIsbn', () => {
  it('accepts a valid EAN-13 barcode number', () => {
    expect(normalizeIsbn('9780143039433')).toBe('9780143039433');
  });

  it('accepts a 979-prefixed ISBN-13', () => {
    expect(normalizeIsbn('9791037207760')).toBe('9791037207760');
  });

  it('accepts a valid ISBN-10 and keeps the X check digit', () => {
    expect(normalizeIsbn('080442957X')).toBe('080442957X');
  });

  it('strips hyphens and spaces before validating', () => {
    expect(normalizeIsbn('978-0-14-303943-3')).toBe('9780143039433');
    expect(normalizeIsbn(' 0 8044 2957 X ')).toBe('080442957X');
  });

  it('rejects checksum failures from a bad scan or typo', () => {
    expect(normalizeIsbn('9780143039434')).toBeNull();
    expect(normalizeIsbn('0804429571')).toBeNull();
  });

  it('rejects wrong lengths, letters, and non-ISBN EANs', () => {
    expect(normalizeIsbn('12345')).toBeNull();
    expect(normalizeIsbn('97801430394')).toBeNull();
    expect(normalizeIsbn('ABC0143039433')).toBeNull();
    // Valid EAN-13 checksum but not a 978/979 bookland prefix.
    expect(normalizeIsbn('4006381333931')).toBeNull();
  });
});

describe('parseIsbnPayload', () => {
  const isbn = '9780143039433';
  const payload = {
    [`ISBN:${isbn}`]: {
      title: 'The Name of the Wind',
      authors: [{ name: 'Patrick Rothfuss' }],
      publishers: [{ name: 'DAW Books' }],
      publish_date: 'March 27, 2007',
      number_of_pages: 662,
      cover: {
        small: 'https://covers.openlibrary.org/b/id/123-S.jpg',
        medium: 'https://covers.openlibrary.org/b/id/123-M.jpg',
        large: 'https://covers.openlibrary.org/b/id/123-L.jpg',
      },
    },
  };

  it('maps the Books API payload into a book result', () => {
    expect(parseIsbnPayload(payload, isbn)).toEqual({
      title: 'The Name of the Wind',
      author: 'Patrick Rothfuss',
      publisher: 'DAW Books',
      publicationYear: 2007,
      totalPages: 662,
      coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
    });
  });

  it('prefers the large cover but falls back to medium then small', () => {
    const noLarge = {
      [`ISBN:${isbn}`]: {
        ...payload[`ISBN:${isbn}`],
        cover: { medium: 'https://covers.openlibrary.org/b/id/123-M.jpg' },
      },
    };
    expect(parseIsbnPayload(noLarge, isbn)?.coverUrl).toBe(
      'https://covers.openlibrary.org/b/id/123-M.jpg',
    );
  });

  it('merges a series subtitle into the title', () => {
    const withSubtitle = {
      [`ISBN:${isbn}`]: {
        ...payload[`ISBN:${isbn}`],
        title: 'Sword art online',
        subtitle: 'Progressive',
      },
    };
    expect(parseIsbnPayload(withSubtitle, isbn)?.title).toBe('Sword art online: Progressive');
  });

  it('returns nulls for missing optional fields', () => {
    const sparse = { [`ISBN:${isbn}`]: { title: 'Bare Book' } };
    expect(parseIsbnPayload(sparse, isbn)).toEqual({
      title: 'Bare Book',
      author: null,
      publisher: null,
      publicationYear: null,
      totalPages: null,
      coverUrl: null,
    });
  });

  it('returns null when the ISBN key or title is missing', () => {
    expect(parseIsbnPayload({}, isbn)).toBeNull();
    expect(parseIsbnPayload({ [`ISBN:${isbn}`]: { title: '' } }, isbn)).toBeNull();
    expect(parseIsbnPayload(null, isbn)).toBeNull();
    expect(parseIsbnPayload('nope', isbn)).toBeNull();
  });
});

describe('parseCoverSearchPayload', () => {
  it('keeps only docs with covers and dedupes repeated cover ids', () => {
    const payload = {
      docs: [
        { cover_i: 11, title: 'A', author_name: ['Author One'], first_publish_year: 1999, number_of_pages_median: 350 },
        { title: 'No cover' },
        { cover_i: 11, title: 'A (reprint)' },
        { cover_i: 22, title: 'B', author_name: [], first_publish_year: 'not-a-year' },
      ],
    };
    const result = parseCoverSearchPayload(payload);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      coverId: 11,
      previewUrl: 'https://covers.openlibrary.org/b/id/11-M.jpg',
      coverUrl: 'https://covers.openlibrary.org/b/id/11-L.jpg',
      title: 'A',
      author: 'Author One',
      year: 1999,
      pagesMedian: 350,
    });
    expect(result[1].author).toBeNull();
    expect(result[1].year).toBeNull();
    expect(result[1].pagesMedian).toBeNull();
  });

  it('caps the candidate list at eight covers', () => {
    const docs = Array.from({ length: 12 }, (_, i) => ({ cover_i: i + 1, title: `Book ${i}` }));
    expect(parseCoverSearchPayload({ docs })).toHaveLength(8);
  });

  it('returns an empty list for malformed payloads', () => {
    expect(parseCoverSearchPayload(null)).toEqual([]);
    expect(parseCoverSearchPayload({})).toEqual([]);
    expect(parseCoverSearchPayload({ docs: 'nope' })).toEqual([]);
  });
});

describe('coverUrlForId', () => {
  it('builds the covers.openlibrary.org URL for each size', () => {
    expect(coverUrlForId(240727, 'S')).toBe('https://covers.openlibrary.org/b/id/240727-S.jpg');
    expect(coverUrlForId(240727, 'L')).toBe('https://covers.openlibrary.org/b/id/240727-L.jpg');
  });
});
