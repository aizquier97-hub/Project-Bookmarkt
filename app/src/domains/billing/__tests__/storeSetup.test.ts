import { subscriptionLegalLinks, PRIVACY_POLICY_URL } from '../legalLinks';
import { revenueCatKeyFor } from '../purchases';

describe('revenueCatKeyFor', () => {
  const keys = { google: 'goog_test', apple: 'appl_test' };

  it('picks the store key for the platform', () => {
    expect(revenueCatKeyFor('android', keys)).toBe('goog_test');
    expect(revenueCatKeyFor('ios', keys)).toBe('appl_test');
  });

  it('reports no key when the store is not set up yet', () => {
    expect(revenueCatKeyFor('ios', { google: 'goog_test', apple: '' })).toBeNull();
    expect(revenueCatKeyFor('ios', { google: 'goog_test', apple: '   ' })).toBeNull();
    expect(revenueCatKeyFor('web', keys)).toBeNull();
  });

  it('ships the Google key by default', () => {
    expect(revenueCatKeyFor('android')).toMatch(/^goog_/);
  });
});

describe('subscriptionLegalLinks', () => {
  it('always links the privacy policy', () => {
    for (const platform of ['ios', 'android']) {
      const links = subscriptionLegalLinks(platform);
      expect(links[0]).toMatchObject({ id: 'privacy', url: PRIVACY_POLICY_URL });
      expect(PRIVACY_POLICY_URL).toMatch(/^https:\/\/bookmarkt\.io\//);
    }
  });

  it('adds Apple-accepted Terms of Use on iOS only', () => {
    const ios = subscriptionLegalLinks('ios').map((link) => link.id);
    const android = subscriptionLegalLinks('android').map((link) => link.id);
    expect(ios).toEqual(['privacy', 'terms']);
    expect(android).toEqual(['privacy']);
    expect(subscriptionLegalLinks('ios')[1].url).toMatch(/^https:\/\/www\.apple\.com\/legal\//);
  });
});
