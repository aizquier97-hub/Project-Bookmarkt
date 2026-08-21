import { requireUserId } from '@/domains/auth/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Bookmark = Tables<'bookmarks'>;

export interface BookmarkWithBook extends Bookmark {
  topics: { id: number; name: string } | null;
}

// Codes avoid confusable characters so printed bookmarks stay human-readable.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateBookmarkCode(): string {
  let raw = '';
  for (let i = 0; i < 10; i += 1) {
    raw += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `BM-${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function normalizeBookmarkCode(code: string): string {
  return code.trim().toUpperCase();
}

async function logBookmarkEvent(
  bookmarkId: string,
  event: 'registered' | 'claimed' | 'linked' | 'unlinked' | 'relinked' | 'scanned',
  topicId: number | null,
  userId: string,
): Promise<void> {
  // Audit history must never block the user action it describes.
  const { error } = await supabase.from('bookmark_events').insert({
    bookmark_id: bookmarkId,
    user_id: userId,
    event,
    topic_id: topicId,
  });
  if (error && __DEV__) {
    console.warn('bookmark event log failed', error.message);
  }
}

export async function listBookmarks(): Promise<BookmarkWithBook[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*, topics(id, name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as BookmarkWithBook[];
}

/** Visible if the caller owns it or nobody has claimed it yet (RLS-enforced). */
export async function getBookmarkByCode(code: string): Promise<Bookmark | null> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('code', normalizeBookmarkCode(code))
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

/** Registers a brand-new bookmark owned by the caller (Stage 2 self-service). */
export async function registerBookmark(code?: string): Promise<Bookmark> {
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const finalCode = code ? normalizeBookmarkCode(code) : generateBookmarkCode();
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({
      code: finalCode,
      user_id: userId,
      claimed_at: now,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('This bookmark code already belongs to an account.');
    }
    throw error;
  }
  await logBookmarkEvent(data.id, 'registered', null, userId);
  await logBookmarkEvent(data.id, 'claimed', null, userId);
  return data;
}

/** Claims an unclaimed factory bookmark into the caller's account. */
export async function claimBookmark(bookmarkId: string): Promise<Bookmark> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('bookmarks')
    .update({ user_id: userId, claimed_at: new Date().toISOString() })
    .eq('id', bookmarkId)
    .is('user_id', null)
    .select()
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error('This bookmark was already claimed by another account.');
  }
  await logBookmarkEvent(data.id, 'claimed', null, userId);
  return data;
}

/** Links (or relinks) a bookmark the caller owns to one of their books. */
export async function linkBookmark(bookmarkId: string, topicId: number): Promise<Bookmark> {
  const userId = await requireUserId();
  const { data: existing, error: readError } = await supabase
    .from('bookmarks')
    .select('topic_id')
    .eq('id', bookmarkId)
    .eq('user_id', userId)
    .single();
  if (readError) {
    throw readError;
  }
  const wasLinked = existing.topic_id !== null;
  const { data, error } = await supabase
    .from('bookmarks')
    .update({ topic_id: topicId, linked_at: new Date().toISOString() })
    .eq('id', bookmarkId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    throw error;
  }
  await logBookmarkEvent(data.id, wasLinked ? 'relinked' : 'linked', topicId, userId);
  return data;
}

export async function unlinkBookmark(bookmarkId: string): Promise<Bookmark> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('bookmarks')
    .update({ topic_id: null, linked_at: null })
    .eq('id', bookmarkId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    throw error;
  }
  await logBookmarkEvent(data.id, 'unlinked', null, userId);
  return data;
}

/** Removes a bookmark row from the caller's account entirely. */
export async function removeBookmark(bookmarkId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
}

/** Fire-and-forget scan audit; never blocks navigation. */
export function recordBookmarkScan(bookmarkId: string, topicId: number | null): void {
  void (async () => {
    try {
      const userId = await requireUserId();
      await logBookmarkEvent(bookmarkId, 'scanned', topicId, userId);
    } catch {
      // Scan auditing is best-effort by design.
    }
  })();
}
