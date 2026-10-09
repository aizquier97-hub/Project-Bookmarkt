import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * First-run state for the welcome tour (D-084). Per device, not per account:
 * the tour explains the app, and the same phone needs it once. The stored
 * value is a version number so a materially new tour can be shown again by
 * bumping ONBOARDING_VERSION. Storage trouble never traps the reader: if
 * the flag cannot be read the tour is treated as already seen.
 */
export const ONBOARDING_SEEN_KEY = 'bookmarkt.onboarding.seen';
export const ONBOARDING_VERSION = 1;

export type OnboardingStatus = 'unknown' | 'pending' | 'seen';

export interface OnboardingState {
  status: OnboardingStatus;
  /** Set when the reader asks for the tour again from Settings. */
  replay: boolean;
}

let state: OnboardingState = { status: 'unknown', replay: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<OnboardingState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

export function getOnboardingState(): OnboardingState {
  return state;
}

export function subscribeOnboarding(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function shouldShowOnboarding(s: OnboardingState): boolean {
  return s.replay || s.status === 'pending';
}

/** Reads the persisted flag once per app run. */
export function loadOnboardingState(): Promise<void> {
  if (state.status !== 'unknown') {
    return Promise.resolve();
  }
  if (!loading) {
    loading = (async () => {
      try {
        const stored = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
        setState({ status: stored === String(ONBOARDING_VERSION) ? 'seen' : 'pending' });
      } catch {
        setState({ status: 'seen' });
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

/** Hides the tour now and remembers that on this device. */
export async function dismissOnboarding(): Promise<void> {
  setState({ status: 'seen', replay: false });
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, String(ONBOARDING_VERSION));
  } catch {
    // Worst case the tour shows once more on the next launch.
  }
}

export function replayOnboarding(): void {
  setState({ replay: true });
}

/** Whether the tour should be on screen right now; loads the flag on first use. */
export function useOnboardingVisible(): boolean {
  useEffect(() => {
    void loadOnboardingState();
  }, []);
  const current = useSyncExternalStore(subscribeOnboarding, getOnboardingState, getOnboardingState);
  return shouldShowOnboarding(current);
}

export function resetOnboardingForTests(): void {
  state = { status: 'unknown', replay: false };
  loading = null;
  listeners.clear();
}
