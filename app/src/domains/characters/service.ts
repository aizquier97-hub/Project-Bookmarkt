import { requireUserId } from '@/domains/auth/service';
import {
  mergeCharacterDescription,
  type CharacterDetails,
} from '@/domains/characters/encoding';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Character = Tables<'characters'>;

export {
  mergeCharacterDescription,
  parseCharacterDescription,
  type CharacterDetails,
} from '@/domains/characters/encoding';

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
  details: CharacterDetails,
): Promise<Character> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Character name is required.');
  }
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('characters')
    .insert({
      name: trimmedName,
      description: mergeCharacterDescription({
        role: details.role.trim(),
        description: details.description.trim(),
        relationships: details.relationships.trim(),
      }),
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

export async function updateCharacter(
  characterId: number,
  bookId: number,
  name: string,
  details: CharacterDetails,
): Promise<void> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Character name cannot be empty.');
  }
  const userId = await requireUserId();
  const { error } = await supabase
    .from('characters')
    .update({
      name: trimmedName,
      description: mergeCharacterDescription({
        role: details.role.trim(),
        description: details.description.trim(),
        relationships: details.relationships.trim(),
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', characterId)
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (error) {
    throw error;
  }
}

export async function deleteCharacter(characterId: number, bookId: number): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId)
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (error) {
    throw error;
  }
}
