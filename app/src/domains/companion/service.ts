import { requireUserId } from '@/domains/auth/service';
import {
  assertCompanionEntitled,
  fetchCompanionEntitlement,
} from '@/domains/companion/entitlement';
import {
  assembleCompanionContext,
  type CompanionContext,
} from '@/domains/companion/grounding';
import { supabase } from '@/lib/supabase';

/**
 * Companion retrieval service. The entitlement gate is the FIRST statement:
 * a denied request performs no retrieval and could never reach an AI
 * provider. (The companion Edge Function independently re-checks the same
 * row server-side, so this client gate is UX, not security.)
 */
export async function getCompanionContext(bookId: number): Promise<CompanionContext> {
  assertCompanionEntitled(await fetchCompanionEntitlement());

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
