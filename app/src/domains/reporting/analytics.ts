import { requireUserId } from '@/domains/auth/service';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * Product analytics, ported from the PWA: same event names and property
 * shapes, fire-and-forget so tracking never blocks or breaks a user action.
 */

export type AnalyticsEventName =
  | 'user_signed_in'
  | 'book_added'
  | 'book_opened'
  | 'book_finished'
  | 'manual_entry_added'
  | 'character_map_saved'
  | 'recap_teaser_tapped'
  | 'companion_opened'
  | 'companion_message_sent'
  | 'recap_requested'
  | 'companion_tool_used'
  | 'entry_flag_applied'
  | 'semantic_search_used'
  | 'reading_session_completed'
  | 'reading_session_abandoned'
  // Sandglass → character map handoff (D-077); mode only, no names.
  | 'timer_character_prompt_used'
  | 'trophy_piece_unlocked'
  | 'quote_favorited'
  | 'quote_reflection_saved'
  | 'difficulty_override_set'
  // Subscription analytics (D-068): lifecycle signals only - never prices,
  // currencies, receipts, or store account details.
  | 'subscription_viewed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'purchases_restored'
  | 'trial_started'
  | 'trial_locked_viewed'
  // First-run tour (D-084): outcome and how far the reader got, nothing else.
  | 'onboarding_finished';

export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  eventProperties: { [key: string]: Json | undefined },
  topicId: number | null = null,
): void {
  void (async () => {
    try {
      const userId = await requireUserId();
      const { error } = await supabase.from('analytics_events').insert({
        user_id: userId,
        topic_id: topicId,
        event_name: eventName,
        event_properties: eventProperties,
      });
      if (error && __DEV__) {
        console.warn('analytics event failed', eventName, error.message);
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('analytics event failed', eventName, err);
      }
    }
  })();
}
