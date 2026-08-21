import { requireUserId } from '@/domains/auth/service';
import { assertCompanionEntitled } from '@/domains/companion/entitlement';
import {
  assembleCompanionContext,
  type CompanionContext,
} from '@/domains/companion/grounding';
import { supabase } from '@/lib/supabase';

/**
 * Companion retrieval service. The entitlement gate is the FIRST statement:
 * a denied request performs no retrieval and could never reach an AI
 * provider. Stage 2 ships retrieval only — there is no generation call.
 */
export async function getCompanionContext(bookId: number): Promise<CompanionContext> {
  assertCompanionEntitled();

  const userId = await requireUserId();

  const [entriesResult, charactersResult] = await Promise.all([
    supabase
      .from('entries')
      .select('id, user_id, topic_id, text, created_at')
      .eq('user_id', userId)
      .eq('topic_id', bookId)
      .order('created_at', { ascending: false }),
    supabase
      .from('characters')
      .select('id, user_id, topic_id, name, description')
      .eq('user_id', userId)
      .eq('topic_id', bookId)
      .order('name', { ascending: true }),
  ]);

  if (entriesResult.error) {
    throw entriesResult.error;
  }
  if (charactersResult.error) {
    throw charactersResult.error;
  }

  return assembleCompanionContext({
    requestingUserId: userId,
    bookId,
    entries: entriesResult.data ?? [],
    characters: charactersResult.data ?? [],
  });
}
