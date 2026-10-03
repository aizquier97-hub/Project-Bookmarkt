import { supabase } from '@/lib/supabase';

/**
 * Data export (Stage 4 Phase 4 foundations): everything the reader authored,
 * gathered under their own RLS-scoped session and rendered as portable JSON.
 * The export leaves through the system share sheet; nothing new is stored.
 */

interface ExportBookRow {
  id: number;
  name: string;
  author: string | null;
  genre: string | null;
  isbn: string | null;
  finished_at: string | null;
  created_at: string | null;
  difficulty_override?: number | null;
}

interface ExportEntryRow {
  id: number;
  topic_id: number | null;
  text: string;
  raw_transcript: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_favorite?: boolean | null;
  reflection?: string | null;
}

interface ExportCharacterRow {
  id: number;
  topic_id: number | null;
  name: string;
  description: string;
  created_at: string | null;
  updated_at: string | null;
}

interface ExportBookmarkRow {
  code: string;
  topic_id: number | null;
  claimed_at: string | null;
  linked_at: string | null;
}

interface ExportSessionRow {
  topic_id: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  planned_seconds: number | null;
  start_page: number | null;
  end_page: number | null;
  pages_read: number | null;
}

export interface ExportPayload {
  format: 'bookmarkt-export';
  version: 2;
  exported_at: string;
  account_email: string | null;
  counts: {
    books: number;
    entries: number;
    characters: number;
    bookmarks: number;
    reading_sessions: number;
  };
  books: {
    title: string;
    author: string | null;
    genre: string | null;
    isbn: string | null;
    finished_at: string | null;
    created_at: string | null;
    difficulty_override: number | null;
    entries: {
      text: string;
      voice_transcript: string | null;
      created_at: string | null;
      updated_at: string | null;
      is_favorite: boolean;
      reflection: string | null;
    }[];
    characters: {
      name: string;
      description: string;
      created_at: string | null;
      updated_at: string | null;
    }[];
    reading_sessions: {
      started_at: string;
      ended_at: string;
      duration_seconds: number;
      planned_seconds: number | null;
      start_page: number | null;
      end_page: number | null;
      pages_read: number | null;
    }[];
  }[];
  bookmarks: {
    code: string;
    linked_book_title: string | null;
    claimed_at: string | null;
    linked_at: string | null;
  }[];
}

/** Pure assembly so the export shape is unit-testable without a network. */
export function buildExportPayload(input: {
  email: string | null;
  exportedAt: string;
  books: ExportBookRow[];
  entries: ExportEntryRow[];
  characters: ExportCharacterRow[];
  bookmarks: ExportBookmarkRow[];
  sessions?: ExportSessionRow[];
}): ExportPayload {
  const sessions = input.sessions ?? [];
  const titleByBook = new Map<number, string>();
  for (const book of input.books) {
    titleByBook.set(book.id, book.name);
  }
  const entriesByBook = new Map<number, ExportEntryRow[]>();
  for (const entry of input.entries) {
    if (entry.topic_id === null) {
      continue;
    }
    const list = entriesByBook.get(entry.topic_id) ?? [];
    list.push(entry);
    entriesByBook.set(entry.topic_id, list);
  }
  const charactersByBook = new Map<number, ExportCharacterRow[]>();
  for (const character of input.characters) {
    if (character.topic_id === null) {
      continue;
    }
    const list = charactersByBook.get(character.topic_id) ?? [];
    list.push(character);
    charactersByBook.set(character.topic_id, list);
  }
  const sessionsByBook = new Map<number, ExportSessionRow[]>();
  for (const session of sessions) {
    const list = sessionsByBook.get(session.topic_id) ?? [];
    list.push(session);
    sessionsByBook.set(session.topic_id, list);
  }
  return {
    format: 'bookmarkt-export',
    version: 2,
    exported_at: input.exportedAt,
    account_email: input.email,
    counts: {
      books: input.books.length,
      entries: input.entries.length,
      characters: input.characters.length,
      bookmarks: input.bookmarks.length,
      reading_sessions: sessions.length,
    },
    books: input.books.map((book) => ({
      title: book.name,
      author: book.author,
      genre: book.genre,
      isbn: book.isbn,
      finished_at: book.finished_at,
      created_at: book.created_at,
      difficulty_override: book.difficulty_override ?? null,
      entries: (entriesByBook.get(book.id) ?? []).map((entry) => ({
        text: entry.text,
        voice_transcript: entry.raw_transcript,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        is_favorite: Boolean(entry.is_favorite),
        reflection: entry.reflection ?? null,
      })),
      characters: (charactersByBook.get(book.id) ?? []).map((character) => ({
        name: character.name,
        description: character.description,
        created_at: character.created_at,
        updated_at: character.updated_at,
      })),
      reading_sessions: (sessionsByBook.get(book.id) ?? []).map((session) => ({
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_seconds: session.duration_seconds,
        planned_seconds: session.planned_seconds,
        start_page: session.start_page,
        end_page: session.end_page,
        pages_read: session.pages_read,
      })),
    })),
    bookmarks: input.bookmarks.map((bookmark) => ({
      code: bookmark.code,
      linked_book_title:
        bookmark.topic_id !== null ? (titleByBook.get(bookmark.topic_id) ?? null) : null,
      claimed_at: bookmark.claimed_at,
      linked_at: bookmark.linked_at,
    })),
  };
}

export function serializeExport(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Gathers the signed-in reader's data. RLS scopes every query to them. */
export async function fetchExportPayload(): Promise<ExportPayload> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('You must be signed in.');
  }
  const [books, entries, characters, bookmarks, sessions] = await Promise.all([
    supabase
      .from('topics')
      .select('id, name, author, genre, isbn, finished_at, created_at, difficulty_override')
      .order('created_at', { ascending: true }),
    supabase
      .from('entries')
      .select('id, topic_id, text, raw_transcript, created_at, updated_at, is_favorite, reflection')
      .order('created_at', { ascending: true }),
    supabase
      .from('characters')
      .select('id, topic_id, name, description, created_at, updated_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('bookmarks')
      .select('code, topic_id, claimed_at, linked_at')
      .eq('user_id', userData.user.id)
      .order('claimed_at', { ascending: true }),
    supabase
      .from('reading_sessions')
      .select(
        'topic_id, started_at, ended_at, duration_seconds, planned_seconds, start_page, end_page, pages_read',
      )
      .order('started_at', { ascending: true }),
  ]);
  const failed =
    books.error ?? entries.error ?? characters.error ?? bookmarks.error ?? sessions.error;
  if (failed) {
    throw new Error('Your data could not be gathered. Please try again.');
  }
  return buildExportPayload({
    email: userData.user.email ?? null,
    exportedAt: new Date().toISOString(),
    books: books.data ?? [],
    entries: entries.data ?? [],
    characters: characters.data ?? [],
    bookmarks: bookmarks.data ?? [],
    sessions: sessions.data ?? [],
  });
}
