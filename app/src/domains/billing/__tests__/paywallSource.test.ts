import {
  normalizePaywallSource,
  openSubscription,
  PAYWALL_SOURCES,
} from '@/domains/billing/paywallSource';

describe('normalizePaywallSource', () => {
  it('accepts every known source, including the array form expo-router can hand back', () => {
    for (const source of PAYWALL_SOURCES) {
      expect(normalizePaywallSource(source)).toBe(source);
      expect(normalizePaywallSource([source])).toBe(source);
    }
  });

  it('falls back to unknown for anything else', () => {
    expect(normalizePaywallSource(undefined)).toBe('unknown');
    expect(normalizePaywallSource('')).toBe('unknown');
    expect(normalizePaywallSource('deep_link_guess')).toBe('unknown');
    expect(normalizePaywallSource(42)).toBe('unknown');
  });
});

describe('openSubscription', () => {
  it('routes to the subscription screen with the source as a param', () => {
    const push = jest.fn();
    openSubscription({ push }, 'settings');
    expect(push).toHaveBeenCalledWith({ pathname: '/subscription', params: { source: 'settings' } });
  });
});
