/**
 * Open Library metadata lookup, ported verbatim from the PWA prototype.
 * Manual user input always wins; the lookup only fills missing fields and
 * every failure path resolves to null so saving is never blocked.
 */

const LOOKUP_TIMEOUT_MS = 9000;
const LOOKUP_LIMIT = 8;

export interface BookMetadataQuery {
  title: string;
  author?: string;
  publisherHint?: string;
  yearHint?: string | number | null;
}

export interface BookMetadataResult {
  publisher: string | null;
  publicationYear: number | null;
  totalPages: number | null;
  source: 'openlibrary-search';
}

interface OpenLibraryDoc {
  author_name?: unknown;
  publisher?: unknown;
  first_publish_year?: unknown;
  number_of_pages_median?: unknown;
}

export function normalizeOptionalPositiveInt(value: unknown): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function normalizeOptionalPublicationYear(value: unknown): number | null {
  const parsed = normalizeOptionalPositiveInt(value);
  if (!parsed) return null;
  const currentYear = new Date().getFullYear();
  if (parsed < 1000 || parsed > currentYear + 1) return null;
  return parsed;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function toLowerList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').toLowerCase()) : [];
}

/** Scores docs the way the PWA did: author +25, publisher +15, year proximity, pages +8, year +4. */
export function pickBestDoc(
  docs: OpenLibraryDoc[],
  authorHint: string,
  publisherHint: string,
  yearHint: number | null,
): OpenLibraryDoc | null {
  const normalizedAuthorHint = authorHint.toLowerCase();
  const normalizedPublisherHint = publisherHint.toLowerCase();
  let bestDoc: OpenLibraryDoc | null = null;
  let bestScore = -Infinity;
  for (const doc of docs) {
    let score = 0;
    const docAuthors = toLowerList(doc.author_name);
    const docPublishers = toLowerList(doc.publisher);
    const docYear = normalizeOptionalPublicationYear(doc.first_publish_year);
    const docPages = normalizeOptionalPositiveInt(doc.number_of_pages_median);
    if (
      normalizedAuthorHint &&
      docAuthors.some(
        (item) => item.includes(normalizedAuthorHint) || normalizedAuthorHint.includes(item),
      )
    ) {
      score += 25;
    }
    if (
      normalizedPublisherHint &&
      docPublishers.some(
        (item) => item.includes(normalizedPublisherHint) || normalizedPublisherHint.includes(item),
      )
    ) {
      score += 15;
    }
    if (yearHint && docYear) {
      const yearDistance = Math.abs(docYear - yearHint);
      score += Math.max(0, 15 - yearDistance);
    }
    if (docPages) score += 8;
    if (docYear) score += 4;
    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }
  return bestDoc;
}

export async function lookupBookMetadata(
  query: BookMetadataQuery,
): Promise<BookMetadataResult | null> {
  const title = query.title?.trim() ?? '';
  const author = query.author?.trim() ?? '';
  const publisherHint = query.publisherHint?.trim() ?? '';
  const yearHint = normalizeOptionalPublicationYear(query.yearHint);
  if (!title) return null;

  const params = new URLSearchParams();
  params.set('title', title);
  if (author) params.set('author', author);
  params.set('limit', String(LOOKUP_LIMIT));
  const lookupUrl = `https://openlibrary.org/search.json?${params.toString()}`;

  const resp = await withTimeout(
    fetch(lookupUrl),
    LOOKUP_TIMEOUT_MS,
    'Book metadata lookup timed out.',
  );
  if (!resp.ok) return null;
  const payload: unknown = await resp.json();
  const docs =
    payload && typeof payload === 'object' && Array.isArray((payload as { docs?: unknown }).docs)
      ? ((payload as { docs: OpenLibraryDoc[] }).docs ?? [])
      : [];
  if (!docs.length) return null;

  const bestDoc = pickBestDoc(docs, author, publisherHint, yearHint);
  if (!bestDoc) return null;

  const publisherList = Array.isArray(bestDoc.publisher) ? bestDoc.publisher : [];
  const resolvedPublisher = publisherList.length ? String(publisherList[0] ?? '').trim() : '';
  const resolvedYear = normalizeOptionalPublicationYear(bestDoc.first_publish_year);
  const resolvedPages = normalizeOptionalPositiveInt(bestDoc.number_of_pages_median);
  if (!resolvedPublisher && !resolvedYear && !resolvedPages) return null;

  return {
    publisher: resolvedPublisher || null,
    publicationYear: resolvedYear ?? null,
    totalPages: resolvedPages ?? null,
    source: 'openlibrary-search',
  };
}

export interface ResolvedBookMetadata {
  publisher: string;
  publicationYear: number | null;
  totalPages: number | null;
}

/** Manual values win; the lookup only fills the blanks (PWA contract). */
export async function resolveBookMetadata(input: {
  title: string;
  author: string;
  manualPublisher: string;
  manualPublicationYear: string | number | null;
  manualTotalPages: string | number | null;
}): Promise<ResolvedBookMetadata> {
  const manualPublisher = input.manualPublisher.trim();
  const manualYear = normalizeOptionalPublicationYear(input.manualPublicationYear);
  const manualPages = normalizeOptionalPositiveInt(input.manualTotalPages);

  let lookup: BookMetadataResult | null = null;
  if (!manualPublisher || !manualYear || !manualPages) {
    try {
      lookup = await lookupBookMetadata({
        title: input.title,
        author: input.author,
        publisherHint: manualPublisher,
        yearHint: manualYear,
      });
    } catch (err) {
      if (__DEV__) {
        console.warn('Book metadata lookup error:', err);
      }
    }
  }

  return {
    publisher: manualPublisher || (lookup?.publisher ?? ''),
    publicationYear: manualYear ?? lookup?.publicationYear ?? null,
    totalPages: manualPages ?? lookup?.totalPages ?? null,
  };
}
