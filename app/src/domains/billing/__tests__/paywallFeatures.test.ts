import { PAYWALL_FEATURES } from '@/domains/billing/paywallFeatures';

describe('PAYWALL_FEATURES', () => {
  it('lists free capture before the premium companion rows', () => {
    const firstPremium = PAYWALL_FEATURES.findIndex((f) => !f.free);
    expect(firstPremium).toBeGreaterThan(0);
    expect(PAYWALL_FEATURES.slice(firstPremium).every((f) => !f.free)).toBe(true);
  });

  it('includes every feature in the Book Club tier and keeps capture free', () => {
    expect(PAYWALL_FEATURES.every((f) => f.premium)).toBe(true);
    expect(PAYWALL_FEATURES.find((f) => f.id === 'capture')?.free).toBe(true);
    expect(PAYWALL_FEATURES.find((f) => f.id === 'dialogue')?.free).toBe(false);
  });

  it('has unique ids', () => {
    expect(new Set(PAYWALL_FEATURES.map((f) => f.id)).size).toBe(PAYWALL_FEATURES.length);
  });
});
