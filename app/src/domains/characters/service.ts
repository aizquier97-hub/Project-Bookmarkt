import { requireUserId } from '@/domains/auth/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Character = Tables<'characters'>;

export async function listCharacters(bookId: number): Promise<Character[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('topic_id', bookId)
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function addCharacter(
  bookId: number,
  name: string,
  description: string,
): Promise<Character> {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  if (!trimmedName) {
    throw new Error('Character name is required.');
  }
  if (!trimmedDescription) {
    throw new Error('Character description is required.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('characters')
    .insert({
      name: trimmedName,
      description: trimmedDescription,
      topic_id: bookId,
      user_id: userId,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  return data;
}
