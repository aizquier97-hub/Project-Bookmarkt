import {
  normalizeOptionalPositiveInt,
  normalizeOptionalPublicationYear,
  pickBestDoc,
  resolveBookMetadata,
} from '@/domains/library/metadata';

describe('normalizeOptionalPositiveInt', () => {
  it('floors positive numbers and rejects everything else', () => {
    expect(normalizeOptionalPositiveInt('336')).toBe(336);
    expect(normalizeOptionalPositiveInt(12.9)).toBe(12);
    expect(normalizeOptionalPositiveInt('')).toBeNull();
    expect(normalizeOptionalPositiveInt('   ')).toBeNull();
    expect(normalizeOptionalPositiveInt('0')).toBeNull();
    expect(normalizeOptionalPositiveInt('-5')).toBeNull();
    expect(normalizeOptionalPositiveInt('abc')).toBeNull();
    expect(normalizeOptionalPositiveInt(null)).toBeNull();
  });
});

describe('normalizeOptionalPublicationYear', () => {
  it('accepts plausible years only', () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(normalizeOptionalPublicationYear('1984')).toBe(1984);
    expect(normalizeOptionalPublicationYear(nextYear)).toBe(nextYear);
    expect(normalizeOptionalPublicationYear(nextYear + 1)).toBeNull();
    expect(normalizeOptionalPublicationYear('999')).toBeNull();
    expect(normalizeOptionalPublicationYear('')).toBeNull();
  });
});

describe('pickBestDoc', () => {
  const cervantes = {
    author_name: ['Miguel de Cervantes'],
    publisher: ['Penguin Classics'],
    first_publish_year: 1605,
    number_of_pages_median: 1056,
  };
  const unrelated = {
    author_name: ['Someone Else'],
    publisher: ['Obscure House'],
    first_publish_year: 1980,
    number_of_pages_median: 200,
  };

  it('prefers the doc matching the author hint', () => {
    expect(pickBestDoc([unrelated, cervantes], 'cervantes', '', null)).toBe(cervantes);
  });

  it('prefers the doc matching the publisher hint', () => {
    expect(pickBestDoc([unrelated, cervantes], '', 'penguin', null)).toBe(cervantes);
  });

  it('prefers year proximity when no author matches', () => {
    expect(pickBestDoc([cervantes, unrelated], '', '', 1979)).toBe(unrelated);
  });

  it('returns null for an empty list and first doc when nothing scores', () => {
    expect(pickBestDoc([], 'x', '', null)).toBeNull();
    const bare = {};
    expect(pickBestDoc([bare, { author_name: ['n'] }], '', '', null)).toBe(bare);
  });
});

describe('resolveBookMetadata', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call the lookup when every manual field is provided', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await resolveBookMetadata({
      title: 'Don Quixote',
      author: 'Cervantes',
      manualPublisher: 'Penguin',
      manualPublicationYear: '1605',
      manualTotalPages: '1056',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ publisher: 'Penguin', publicationYear: 1605, totalPages: 1056 });
  });

  it('fills gaps from the lookup while manual values win', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          docs: [
            {
              author_name: ['Miguel de Cervantes'],
              publisher: ['Penguin Classics'],
              first_publish_year: 1605,
              number_of_pages_median: 1056,
            },
          ],
        }),
    } as unknown as Response);

    const result = await resolveBookMetadata({
      title: 'Don Quixote',
      author: 'Cervantes',
      manualPublisher: 'My Own Press',
      manualPublicationYear: '',
      manualTotalPages: '',
    });
    expect(result.publisher).toBe('My Own Press');
    expect(result.publicationYear).toBe(1605);
    expect(result.totalPages).toBe(1056);
  });

  it('returns manual-only data when the lookup fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const result = await resolveBookMetadata({
      title: 'Don Quixote',
      author: '',
      manualPublisher: '',
      manualPublicationYear: '1605',
      manualTotalPages: '',
    });
    expect(result).toEqual({ publisher: '', publicationYear: 1605, totalPages: null });
  });
});
