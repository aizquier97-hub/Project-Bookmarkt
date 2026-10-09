import { APP_OPEN_MIN_GAP_MS, decideAppOpen, isBackgroundState } from '@/domains/reporting/appOpen';

describe('decideAppOpen', () => {
  it('counts the first active state as a launch', () => {
    expect(
      decideAppOpen({ previous: null, next: 'active', lastTrackedAtMs: null, nowMs: 1_000 }),
    ).toEqual({ track: true, trigger: 'launch' });
  });

  it('never tracks transitions that are not into the active state', () => {
    expect(
      decideAppOpen({ previous: 'active', next: 'background', lastTrackedAtMs: null, nowMs: 1 }),
    ).toMatchObject({ track: false });
    expect(
      decideAppOpen({ previous: 'active', next: 'inactive', lastTrackedAtMs: 1, nowMs: 2 }),
    ).toMatchObject({ track: false });
  });

  it('tracks a return from the background after the minimum gap', () => {
    const lastTrackedAtMs = 10_000;
    expect(
      decideAppOpen({
        previous: 'background',
        next: 'active',
        lastTrackedAtMs,
        nowMs: lastTrackedAtMs + APP_OPEN_MIN_GAP_MS,
      }),
    ).toEqual({ track: true, trigger: 'foreground' });
  });

  it('ignores a quick flick away and back', () => {
    const lastTrackedAtMs = 10_000;
    expect(
      decideAppOpen({
        previous: 'background',
        next: 'active',
        lastTrackedAtMs,
        nowMs: lastTrackedAtMs + APP_OPEN_MIN_GAP_MS - 1,
      }),
    ).toEqual({ track: false, trigger: 'foreground' });
  });

  it('ignores active-to-active noise once launched', () => {
    expect(
      decideAppOpen({ previous: 'active', next: 'active', lastTrackedAtMs: 0, nowMs: 999_999 }),
    ).toEqual({ track: false, trigger: 'foreground' });
  });

  it('treats inactive as background (iOS app switcher)', () => {
    expect(isBackgroundState('inactive')).toBe(true);
    expect(isBackgroundState('background')).toBe(true);
    expect(isBackgroundState('active')).toBe(false);
    expect(isBackgroundState(null)).toBe(false);
  });
});
