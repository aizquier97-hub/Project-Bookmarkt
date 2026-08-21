import { requireUserId } from '@/domains/auth/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Book = Tables<'topics'>;

export async function listBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function getBook(bookId: number): Promise<Book> {
  const { data, error } = await supabase.from('topics').select('*').eq('id', bookId).single();
  if (error) {
    throw error;
  }
  return data;
}

export async function addBook(input: BookInput): Promise<Book> {
  const trimmed = input.name.trim();
  if (!trimmed) {
    throw new Error('Book title is required.');
  }
  const publicationYear = normalizeOptionalInt(input.publicationYear, 1000, 3000);
  const totalPages = normalizeOptionalInt(input.totalPages, 1, Number.MAX_SAFE_INTEGER);
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('topics')
    .insert({
      name: trimmed,
      author: input.author?.trim() || null,
      publisher: input.publisher?.trim() || null,
      publication_year: publicationYear,
      total_pages: totalPages,
      user_id: userId,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

export async function updateBook(bookId: number, input: BookInput): Promise<Book> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Book title is required.');
  }
  const author = input.author?.trim() ?? '';
  if (!author) {
    throw new Error('Author name is required.');
  }
  const publicationYear = normalizeOptionalInt(input.publicationYear, 1000, 3000);
  const totalPages = normalizeOptionalInt(input.totalPages, 1, Number.MAX_SAFE_INTEGER);
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('topics')
    .update({
      name,
      author,
      publisher: input.publisher?.trim() || null,
      publication_year: publicationYear,
      total_pages: totalPages,
    })
    .eq('id', bookId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}

const BOOK_IMAGES_BUCKET = 'book-images';

export { BOOK_IMAGES_BUCKET };

// Mirrors the PWA: stored image files are removed first because only the DB
// rows cascade when the topic row is deleted.
export async function deleteBook(bookId: number): Promise<void> {
  const userId = await requireUserId();
  const imagesRes = await supabase
    .from('book_images')
    .select('image_url')
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (imagesRes.error) {
    throw imagesRes.error;
  }
  const storagePaths = (imagesRes.data ?? [])
    .map((img) => extractStoragePathFromPublicUrl(img.image_url))
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length) {
    const removeRes = await supabase.storage.from(BOOK_IMAGES_BUCKET).remove(storagePaths);
    if (removeRes.error) {
      throw removeRes.error;
    }
  }
  const { error } = await supabase.from('topics').delete().eq('id', bookId).eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export function extractStoragePathFromPublicUrl(value: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const markers = [
    `/storage/v1/object/public/${BOOK_IMAGES_BUCKET}/`,
    `/storage/v1/object/sign/${BOOK_IMAGES_BUCKET}/`,
    `/storage/v1/object/authenticated/${BOOK_IMAGES_BUCKET}/`,
  ];
  for (const marker of markers) {
    const markerIndex = raw.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }
    const encodedPath = raw.substring(markerIndex + marker.length).split('?')[0];
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
  if (/^(?:https?:|data:|blob:)/i.test(raw)) {
    return null;
  }
  const normalizedPath = raw.replace(/^\/+/, '');
  const bucketPrefix = `${BOOK_IMAGES_BUCKET}/`;
  return normalizedPath.startsWith(bucketPrefix)
    ? normalizedPath.substring(bucketPrefix.length)
    : normalizedPath;
}

export interface BookInput {
  name: string;
  author?: string;
  publisher?: string;
  publicationYear?: string | number | null;
  totalPages?: string | number | null;
}

function normalizeOptionalInt(
  value: string | number | null | undefined,
  min: number,
  max: number,
): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${raw}" is not a valid number.`);
  }
  const int = Math.floor(parsed);
  if (int < min || int > max) {
    throw new Error(`Value ${int} must be between ${min} and ${max}.`);
  }
  return int;
}
