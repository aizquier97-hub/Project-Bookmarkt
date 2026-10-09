import type { AppStateStatus } from 'react-native';

/**
 * Pure decisions behind the `app_opened` signal (D-086). One event per
 * launch, then one per return from the background - but a quick flick to
 * the notification shade and back should not count as a second session, so
 * foregrounds inside the gap are ignored.
 */

export type AppOpenTrigger = 'launch' | 'foreground';

/** Returns from the background closer together than this are one session. */
export const APP_OPEN_MIN_GAP_MS = 30_000;

export interface AppOpenDecision {
  track: boolean;
  trigger: AppOpenTrigger;
}

export function isBackgroundState(status: AppStateStatus | null | undefined): boolean {
  return status === 'background' || status === 'inactive';
}

/**
 * Decides whether a state transition counts as the app being opened.
 * `lastTrackedAtMs` is null until the launch event has been recorded.
 */
export function decideAppOpen(input: {
  previous: AppStateStatus | null;
  next: AppStateStatus;
  lastTrackedAtMs: number | null;
  nowMs: number;
}): AppOpenDecision {
  if (input.next !== 'active') {
    return { track: false, trigger: 'foreground' };
  }
  if (input.lastTrackedAtMs === null) {
    return { track: true, trigger: 'launch' };
  }
  if (!isBackgroundState(input.previous)) {
    return { track: false, trigger: 'foreground' };
  }
  const gap = input.nowMs - input.lastTrackedAtMs;
  return { track: gap >= APP_OPEN_MIN_GAP_MS, trigger: 'foreground' };
}
