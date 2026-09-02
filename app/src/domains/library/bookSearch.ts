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
  normalizeOptionalPositiveInt,
  normalizeOptionalPublicationYear,
  withTimeout,
} from './metadata';

const SEARCH_TIMEOUT_MS = 9000;
const MAX_RESULTS = 10;

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
      title,
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
      title,
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
  params.set('fields', 'key,title,author_name,first_publish_year,number_of_pages_median,cover_i');
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

/**
 * ISBN lookup for the barcode scan and pasted ISBNs: Google Books first,
 * Open Library fallback. Returns null when neither source knows the book.
 */
export async function lookupBookSearchByIsbn(isbn: string): Promise<BookSearchResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) {
    return null;
  }
  try {
    const results = await searchGoogleBooks(`isbn:${normalized}`);
    if (results.length) {
      return { ...results[0], isbn13: normalized };
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
