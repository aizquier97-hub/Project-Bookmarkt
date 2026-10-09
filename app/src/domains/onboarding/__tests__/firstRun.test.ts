import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  dismissOnboarding,
  getOnboardingState,
  loadOnboardingState,
  ONBOARDING_SEEN_KEY,
  ONBOARDING_VERSION,
  replayOnboarding,
  resetOnboardingForTests,
  shouldShowOnboarding,
  subscribeOnboarding,
} from '@/domains/onboarding/firstRun';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  resetOnboardingForTests();
  await AsyncStorage.clear();
});

describe('first-run tour state', () => {
  it('is pending on a fresh device and hidden until the flag is read', async () => {
    expect(shouldShowOnboarding(getOnboardingState())).toBe(false);
    await loadOnboardingState();
    expect(getOnboardingState().status).toBe('pending');
    expect(shouldShowOnboarding(getOnboardingState())).toBe(true);
  });

  it('stays hidden once dismissed, across app runs', async () => {
    await loadOnboardingState();
    await dismissOnboarding();
    expect(shouldShowOnboarding(getOnboardingState())).toBe(false);
    expect(await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)).toBe(String(ONBOARDING_VERSION));

    resetOnboardingForTests();
    await loadOnboardingState();
    expect(getOnboardingState().status).toBe('seen');
    expect(shouldShowOnboarding(getOnboardingState())).toBe(false);
  });

  it('shows again when an older tour version was the one seen', async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, String(ONBOARDING_VERSION - 1));
    await loadOnboardingState();
    expect(getOnboardingState().status).toBe('pending');
  });

  it('replays on request even after it was seen, and dismiss clears the replay', async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, String(ONBOARDING_VERSION));
    await loadOnboardingState();
    expect(shouldShowOnboarding(getOnboardingState())).toBe(false);

    replayOnboarding();
    expect(shouldShowOnboarding(getOnboardingState())).toBe(true);

    await dismissOnboarding();
    expect(getOnboardingState()).toEqual({ status: 'seen', replay: false });
  });

  it('never traps the reader when storage fails', async () => {
    const getItem = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('disk full'));
    await loadOnboardingState();
    expect(getOnboardingState().status).toBe('seen');
    getItem.mockRestore();
  });

  it('reads the flag once per run and notifies subscribers', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');
    const listener = jest.fn();
    const unsubscribe = subscribeOnboarding(listener);

    await Promise.all([loadOnboardingState(), loadOnboardingState()]);
    await loadOnboardingState();
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    replayOnboarding();
    expect(listener).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});
