import { requireUserId } from '@/domains/auth/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Entry = Tables<'entries'>;

export async function listEntries(bookId: number): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('topic_id', bookId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function addEntry(bookId: number, text: string): Promise<Entry> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Entry text is required.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('entries')
    .insert({ text: trimmed, topic_id: bookId, user_id: userId })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}
