import { requireUserId } from '@/domains/auth/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Character = Tables<'characters'>;

export interface CharacterDetails {
  role: string;
  description: string;
  relationships: string;
}

// Description encoding ported verbatim from the PWA ("Role:"/"Description:"/
// "Relationships:" lines) so both clients read each other's records.
export function mergeCharacterDescription(details: CharacterDetails): string {
  const parts: string[] = [];
  if (details.role) parts.push(`Role: ${details.role}`);
  if (details.description) parts.push(`Description: ${details.description}`);
  if (details.relationships) parts.push(`Relationships: ${details.relationships}`);
  return parts.join('\n');
}

export function parseCharacterDescription(description: string | null | undefined): CharacterDetails {
  const parsed: CharacterDetails = { role: '', description: '', relationships: '' };
  const text = description ?? '';
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('Role:')) {
      parsed.role = line.substring(5).trim();
    } else if (line.startsWith('Description:')) {
      parsed.description = line.substring(12).trim();
    } else if (line.startsWith('Relationships:')) {
      parsed.relationships = line.substring(14).trim();
    }
  }
  if (!parsed.role && !parsed.description && !parsed.relationships) {
    parsed.description = text.trim();
  }
  return parsed;
}

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
