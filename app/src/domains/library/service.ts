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

export async function addBook(name: string): Promise<Book> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Book title is required.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('topics')
    .insert({ name: trimmed, user_id: userId })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}
