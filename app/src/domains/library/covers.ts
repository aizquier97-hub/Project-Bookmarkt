/**
 * Book cover art and ISBN lookup via Open Library (D-028).
 *
 * Legal posture: Open Library explicitly supports moderate, real-time,
 * human-facing lookups with attribution; covers are fetched per reader
 * action (a scan or a search), device-side, cached by expo-image - never
 * bulk-harvested. Cover-ID image URLs are not rate-limited. Google Books
 * was considered and declined: its terms restrict charging users for
 * API-derived features, which conflicts with the paid companion.
 * Attribution ("Covers from Open Library") renders in the add/edit forms.
 */

import {
  normalizeOptionalPositiveInt,
  normalizeOptionalPublicationYear,
  withTimeout,
} from './metadata';

const LOOKUP_TIMEOUT_MS = 9000;
const SEARCH_LIMIT = 12;
const MAX_CANDIDATES = 8;

export type CoverSize = 'S' | 'M' | 'L';

export function coverUrlForId(coverId: number, size: CoverSize): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

/**
 * Normalize a typed or scanned ISBN: strips separators, validates length,
 * charset, and checksum (ISBN-10 mod 11, ISBN-13/EAN mod 10 starting
 * 978/979). Returns null for anything that is not a real ISBN so a bad
 * scan or typo never fires a lookup.
 */
export function normalizeIsbn(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(cleaned)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const char = cleaned[i];
      const value = char === 'X' ? 10 : Number(char);
      sum += value * (10 - i);
    }
    return sum % 11 === 0 ? cleaned : null;
  }
  if (/^(978|979)\d{10}$/.test(cleaned)) {
    let sum = 0;
    for (let i = 0; i < 13; i += 1) {
      sum += Number(cleaned[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return sum % 10 === 0 ? cleaned : null;
  }
  return null;
}

export interface IsbnBookResult {
  title: string;
  author: string | null;
  publisher: string | null;
  publicationYear: number | null;
  totalPages: number | null;
  coverUrl: string | null;
}

interface IsbnPayloadEntry {
  title?: unknown;
  authors?: unknown;
  publishers?: unknown;
  publish_date?: unknown;
  number_of_pages?: unknown;
  cover?: unknown;
}

function firstName(list: unknown): string | null {
  if (!Array.isArray(list)) {
    return null;
  }
  for (const item of list) {
    const name =
      item && typeof item === 'object' ? String((item as { name?: unknown }).name ?? '') : '';
    if (name.trim()) {
      return name.trim();
    }
  }
  return null;
}

/** Pure parser for the Open Library Books API (`jscmd=data`) payload. */
export function parseIsbnPayload(payload: unknown, isbn: string): IsbnBookResult | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const entry = (payload as Record<string, IsbnPayloadEntry>)[`ISBN:${isbn}`];
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const title = String(entry.title ?? '').trim();
  if (!title) {
    return null;
  }
  const yearMatch = String(entry.publish_date ?? '').match(/\b(1[0-9]{3}|2[0-9]{3})\b/);
  const cover =
    entry.cover && typeof entry.cover === 'object'
      ? (entry.cover as { large?: unknown; medium?: unknown; small?: unknown })
      : null;
  const coverUrl = String(cover?.large ?? cover?.medium ?? cover?.small ?? '').trim();
  return {
    title,
    author: firstName(entry.authors),
    publisher: firstName(entry.publishers),
    publicationYear: normalizeOptionalPublicationYear(yearMatch ? yearMatch[1] : null),
    totalPages: normalizeOptionalPositiveInt(entry.number_of_pages),
    coverUrl: coverUrl || null,
  };
}

/** One request resolves title, author, publisher, year, pages, and cover. */
export async function lookupBookByIsbn(isbn: string): Promise<IsbnBookResult | null> {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) {
    return null;
  }
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${normalized}&jscmd=data&format=json`;
  const resp = await withTimeout(fetch(url), LOOKUP_TIMEOUT_MS, 'Book lookup timed out.');
  if (!resp.ok) {
    return null;
  }
  return parseIsbnPayload(await resp.json(), normalized);
}

export interface CoverCandidate {
  coverId: number;
  /** Shelf-sized thumbnail for the picker row. */
  previewUrl: string;
  /** Stored on the book; large enough for every surface. */
  coverUrl: string;
  title: string;
  author: string | null;
  year: number | null;
  /** Median page count across editions - a starting point, not gospel. */
  pagesMedian: number | null;
}

interface CoverSearchDoc {
  cover_i?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  number_of_pages_median?: unknown;
}

/** Pure parser for cover search results: keeps docs with covers, dedupes. */
export function parseCoverSearchPayload(payload: unknown): CoverCandidate[] {
  const docs =
    payload && typeof payload === 'object' && Array.isArray((payload as { docs?: unknown }).docs)
      ? ((payload as { docs: CoverSearchDoc[] }).docs ?? [])
      : [];
  const seen = new Set<number>();
  const candidates: CoverCandidate[] = [];
  for (const doc of docs) {
    const coverId = normalizeOptionalPositiveInt(doc.cover_i);
    if (!coverId || seen.has(coverId)) {
      continue;
    }
    seen.add(coverId);
    const authorList = Array.isArray(doc.author_name) ? doc.author_name : [];
    candidates.push({
      coverId,
      previewUrl: coverUrlForId(coverId, 'M'),
      coverUrl: coverUrlForId(coverId, 'L'),
      title: String(doc.title ?? '').trim(),
      author: authorList.length ? String(authorList[0] ?? '').trim() || null : null,
      year: normalizeOptionalPublicationYear(doc.first_publish_year),
      pagesMedian: normalizeOptionalPositiveInt(doc.number_of_pages_median),
    });
    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }
  }
  return candidates;
}

/** Search cover candidates for a title (+ optional author) so the reader picks. */
export async function searchCoverCandidates(
  title: string,
  author?: string,
): Promise<CoverCandidate[]> {
  const trimmed = title.trim();
  if (!trimmed) {
    return [];
  }
  const params = new URLSearchParams();
  params.set('title', trimmed);
  if (author?.trim()) {
    params.set('author', author.trim());
  }
  params.set('limit', String(SEARCH_LIMIT));
  params.set('fields', 'cover_i,title,author_name,first_publish_year,number_of_pages_median');
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const resp = await withTimeout(fetch(url), LOOKUP_TIMEOUT_MS, 'Cover search timed out.');
  if (!resp.ok) {
    return [];
  }
  return parseCoverSearchPayload(await resp.json());
}
