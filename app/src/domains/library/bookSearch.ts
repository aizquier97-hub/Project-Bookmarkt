/**
 * Book search and ISBN lookup via Google Books (D-042), with Open Library
 * as the silent fallback.
 *
 * Legal posture: the Google Books volumes endpoint is public and free; use
 * is governed by the general Google APIs terms, which permit commercial
 * apps. Bookmarkt never charges for Google-sourced data (the paid tier is
 * the AI companion), and attribution renders in the add/edit forms. Open
 * Library remains the cover-picker source (it offers many edition covers)
 * and the fallback when Google is unreachable.
 */

import { lookupBookByIsbn, normalizeIsbn } from './covers';
import {
  joinTitleAndSubtitle,
  normalizeOptionalPositiveInt,
  normalizeOptionalPublicationYear,
  withTimeout,
} from './metadata';

export { joinTitleAndSubtitle };

const SEARCH_TIMEOUT_MS = 9000;
const MAX_RESULTS = 10;

// Optional: a Google Cloud API key lifts the shared anonymous per-IP quota
// (the keyless endpoint 429s when the shared pool is exhausted, which
// silently pushed lookups to Open Library's weaker data).
const GOOGLE_API_KEY = (process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ?? '').trim();

export interface BookSearchResult {
  /** Stable row key: Google volume id or an Open Library-derived key. */
  id: string;
  title: string;
  author: string | null;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
  isbn13: string | null;
  source: 'google-books' | 'open-library';
}

interface GoogleVolume {
  id?: unknown;
  volumeInfo?: {
    title?: unknown;
    subtitle?: unknown;
    authors?: unknown;
    publishedDate?: unknown;
    pageCount?: unknown;
    imageLinks?: { thumbnail?: unknown; smallThumbnail?: unknown };
    industryIdentifiers?: unknown;
  };
}

/** Google serves http thumbnails with a page-curl effect; we want neither. */
export function normalizeGoogleCoverUrl(raw: unknown): string | null {
  const url = String(raw ?? '').trim();
  if (!url) {
    return null;
  }
  return url.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '');
}

function extractIsbn13(identifiers: unknown): string | null {
  if (!Array.isArray(identifiers)) {
    return null;
  }
  for (const entry of identifiers) {
    if (entry && typeof entry === 'object') {
      const { type, identifier } = entry as { type?: unknown; identifier?: unknown };
      if (String(type ?? '') === 'ISBN_13') {
        const normalized = normalizeIsbn(String(identifier ?? ''));
        if (normalized) {
          return normalized;
        }
      }
    }
  }
  return null;
}

/** Pure parser for the Google Books volumes payload. */
export function parseGoogleVolumesPayload(payload: unknown): BookSearchResult[] {
  const items =
    payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? ((payload as { items: GoogleVolume[] }).items ?? [])
      : [];
  const results: BookSearchResult[] = [];
  for (const item of items) {
    const info = item?.volumeInfo;
    const title = String(info?.title ?? '').trim();
    if (!title) {
      continue;
    }
    const authors = Array.isArray(info?.authors) ? info.authors : [];
    const yearMatch = String(info?.publishedDate ?? '').match(/\b(1[0-9]{3}|2[0-9]{3})\b/);
    results.push({
      id: String(item.id ?? `g-${results.length}`),
      title: joinTitleAndSubtitle(title, info?.subtitle),
      author: authors.length ? String(authors[0] ?? '').trim() || null : null,
      year: normalizeOptionalPublicationYear(yearMatch ? yearMatch[1] : null),
      pages: normalizeOptionalPositiveInt(info?.pageCount),
      coverUrl: normalizeGoogleCoverUrl(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail),
      isbn13: extractIsbn13(info?.industryIdentifiers),
      source: 'google-books',
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }
  return results;
}

interface OpenLibrarySearchDoc {
  key?: unknown;
  title?: unknown;
  subtitle?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  number_of_pages_median?: unknown;
  cover_i?: unknown;
}

/** Pure parser for the Open Library search payload (fallback source). */
export function parseOpenLibrarySearchPayload(payload: unknown): BookSearchResult[] {
  const docs =
    payload && typeof payload === 'object' && Array.isArray((payload as { docs?: unknown }).docs)
      ? ((payload as { docs: OpenLibrarySearchDoc[] }).docs ?? [])
      : [];
  const results: BookSearchResult[] = [];
  for (const doc of docs) {
    const title = String(doc.title ?? '').trim();
    if (!title) {
      continue;
    }
    const authorList = Array.isArray(doc.author_name) ? doc.author_name : [];
    const coverId = normalizeOptionalPositiveInt(doc.cover_i);
    results.push({
      id: String(doc.key ?? `ol-${results.length}`),
      title: joinTitleAndSubtitle(title, doc.subtitle),
      author: authorList.length ? String(authorList[0] ?? '').trim() || null : null,
      year: normalizeOptionalPublicationYear(doc.first_publish_year),
      pages: normalizeOptionalPositiveInt(doc.number_of_pages_median),
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      isbn13: null,
      source: 'open-library',
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }
  return results;
}

async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('maxResults', String(MAX_RESULTS));
  params.set('printType', 'books');
  if (GOOGLE_API_KEY) {
    params.set('key', GOOGLE_API_KEY);
  }
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const resp = await withTimeout(fetch(url), SEARCH_TIMEOUT_MS, 'Book search timed out.');
  if (!resp.ok) {
    throw new Error(`Book search failed (${resp.status}).`);
  }
  return parseGoogleVolumesPayload(await resp.json());
}

async function searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(MAX_RESULTS));
  params.set(
    'fields',
    'key,title,subtitle,author_name,first_publish_year,number_of_pages_median,cover_i',
  );
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const resp = await withTimeout(fetch(url), SEARCH_TIMEOUT_MS, 'Book search timed out.');
  if (!resp.ok) {
    return [];
  }
  return parseOpenLibrarySearchPayload(await resp.json());
}

/**
 * Search by title, author, or free text. Google Books first (best search
 * quality); Open Library silently covers a Google outage. Throws only when
 * both sources fail, so the screen can show a retryable error.
 */
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  // A pasted or typed ISBN goes straight to the precise lookup path.
  const asIsbn = normalizeIsbn(trimmed);
  if (asIsbn) {
    const match = await lookupBookSearchByIsbn(asIsbn);
    return match ? [match] : [];
  }
  try {
    const google = await searchGoogleBooks(trimmed);
    if (google.length) {
      return google;
    }
  } catch {
    // fall through to Open Library
  }
  return searchOpenLibrary(trimmed);
}

/** Convert an ISBN-10 to its EAN-13 form so identifiers compare cleanly. */
export function isbn10To13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(isbn10)) {
    return null;
  }
  const base = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return `${base}${(10 - (sum % 10)) % 10}`;
}

/**
 * Google's `isbn:` query is a keyword search, not an exact lookup - it can
 * lead with a sibling volume of a series. Only a result carrying the exact
 * requested ISBN is trusted; anything else falls through to Open Library's
 * exact-ISBN endpoint.
 */
export function pickVolumeMatchingIsbn(
  results: BookSearchResult[],
  isbn: string,
): BookSearchResult | null {
  const target = isbn.length === 10 ? isbn10To13(isbn) : isbn;
  if (!target) {
    return null;
  }
  return results.find((result) => result.isbn13 === target) ?? null;
}

/**
 * ISBN lookup for the barcode scan and pasted ISBNs: Google Books first
 * (exact-volume match required), Open Library exact lookup as fallback.
 * Returns null when neither source knows the precise edition.
 */
export async function lookupBookSearchByIsbn(isbn: string): Promise<BookSearchResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) {
    return null;
  }
  try {
    const results = await searchGoogleBooks(`isbn:${normalized}`);
    const exact = pickVolumeMatchingIsbn(results, normalized);
    if (exact) {
      return { ...exact, isbn13: normalized };
    }
  } catch {
    // fall through to Open Library
  }
  try {
    const found = await lookupBookByIsbn(normalized);
    if (found) {
      return {
        id: `isbn-${normalized}`,
        title: found.title,
        author: found.author,
        year: found.publicationYear,
        pages: found.totalPages,
        coverUrl: found.coverUrl,
        isbn13: normalized,
        source: 'open-library',
      };
    }
  } catch {
    // both sources unreachable
  }
  return null;
}

function normalizeTitleForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Pure matcher: an exact normalized-title hit with pages, else null. */
export function pickPagesForTitle(
  results: BookSearchResult[],
  title: string,
  author?: string | null,
): number | null {
  const target = normalizeTitleForMatch(title);
  if (!target) {
    return null;
  }
  const authorTarget = normalizeTitleForMatch(author ?? '');
  const candidates = results.filter(
    (result) => result.pages && normalizeTitleForMatch(result.title) === target,
  );
  if (!candidates.length) {
    return null;
  }
  if (authorTarget) {
    const byAuthor = candidates.find((result) => {
      const resultAuthor = normalizeTitleForMatch(result.author ?? '');
      return (
        resultAuthor &&
        (resultAuthor.includes(authorTarget) || authorTarget.includes(resultAuthor))
      );
    });
    if (byAuthor) {
      return byAuthor.pages;
    }
  }
  return candidates[0].pages;
}

/**
 * Page count for a book missing one: Google Books first, requiring an
 * exact title match so a series sibling never supplies its page count.
 * Tries the author-filtered query first, then title-only, because Google
 * can return a pageCount-0 edition under the author filter while the
 * title-only query has the real count. Returns null when Google has no
 * exact match - the caller may then fall back to Open Library's
 * cross-edition median.
 */
export async function lookupPagesForTitle(
  title: string,
  author?: string | null,
): Promise<number | null> {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }
  const authorTrimmed = author?.trim();
  if (authorTrimmed) {
    try {
      const withAuthor = await searchGoogleBooks(`intitle:"${trimmed}" inauthor:"${authorTrimmed}"`);
      const pages = pickPagesForTitle(withAuthor, trimmed, author);
      if (pages) {
        return pages;
      }
    } catch {
      // fall through to the title-only retry
    }
  }
  // Google sometimes returns an edition with pageCount 0 under an author
  // filter while the title-only query surfaces a record with real pages
  // (seen live with "Sword Art Online Progressive 1 (light novel)").
  try {
    const titleOnly = await searchGoogleBooks(`intitle:"${trimmed}"`);
    return pickPagesForTitle(titleOnly, trimmed, author);
  } catch {
    return null;
  }
}
