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
  | 'manual_entry_added'
  | 'character_map_saved'
  | 'recap_teaser_tapped';

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
