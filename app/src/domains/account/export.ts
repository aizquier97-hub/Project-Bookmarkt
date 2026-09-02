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
}

interface ExportEntryRow {
  id: number;
  topic_id: number | null;
  text: string;
  raw_transcript: string | null;
  created_at: string | null;
  updated_at: string | null;
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

export interface ExportPayload {
  format: 'bookmarkt-export';
  version: 1;
  exported_at: string;
  account_email: string | null;
  counts: { books: number; entries: number; characters: number; bookmarks: number };
  books: {
    title: string;
    author: string | null;
    genre: string | null;
    isbn: string | null;
    finished_at: string | null;
    created_at: string | null;
    entries: {
      text: string;
      voice_transcript: string | null;
      created_at: string | null;
      updated_at: string | null;
    }[];
    characters: {
      name: string;
      description: string;
      created_at: string | null;
      updated_at: string | null;
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
}): ExportPayload {
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
  return {
    format: 'bookmarkt-export',
    version: 1,
    exported_at: input.exportedAt,
    account_email: input.email,
    counts: {
      books: input.books.length,
      entries: input.entries.length,
      characters: input.characters.length,
      bookmarks: input.bookmarks.length,
    },
    books: input.books.map((book) => ({
      title: book.name,
      author: book.author,
      genre: book.genre,
      isbn: book.isbn,
      finished_at: book.finished_at,
      created_at: book.created_at,
      entries: (entriesByBook.get(book.id) ?? []).map((entry) => ({
        text: entry.text,
        voice_transcript: entry.raw_transcript,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
      })),
      characters: (charactersByBook.get(book.id) ?? []).map((character) => ({
        name: character.name,
        description: character.description,
        created_at: character.created_at,
        updated_at: character.updated_at,
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
  const [books, entries, characters, bookmarks] = await Promise.all([
    supabase
      .from('topics')
      .select('id, name, author, genre, isbn, finished_at, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('entries')
      .select('id, topic_id, text, raw_transcript, created_at, updated_at')
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
  ]);
  const failed = books.error ?? entries.error ?? characters.error ?? bookmarks.error;
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
  });
}
