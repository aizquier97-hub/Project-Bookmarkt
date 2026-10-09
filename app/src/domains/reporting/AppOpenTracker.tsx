import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { decideAppOpen } from '@/domains/reporting/appOpen';

/**
 * Renders nothing; emits `app_opened` once when the signed-in shell mounts
 * (launch, or sign-in) and again on each return from the background after
 * a short gap (D-086). Mounted only behind the session gate, so the insert
 * always has a reader to attach to. Daily active readers are a distinct
 * count of `user_id` per day on this one event.
 */
export function AppOpenTracker() {
  const lastTrackedAtRef = useRef<number | null>(null);
  const previousRef = useRef<AppStateStatus | null>(null);

  useEffect(() => {
    const apply = (next: AppStateStatus) => {
      const now = Date.now();
      const decision = decideAppOpen({
        previous: previousRef.current,
        next,
        lastTrackedAtMs: lastTrackedAtRef.current,
        nowMs: now,
      });
      previousRef.current = next;
      if (decision.track) {
        lastTrackedAtRef.current = now;
        trackAnalyticsEvent('app_opened', { trigger: decision.trigger });
      }
    };
    // The shell rendering is the launch itself, whatever AppState reports
    // during the first frames (Android briefly says `unknown`).
    apply('active');
    const subscription = AppState.addEventListener('change', apply);
    return () => subscription.remove();
  }, []);

  return null;
}
