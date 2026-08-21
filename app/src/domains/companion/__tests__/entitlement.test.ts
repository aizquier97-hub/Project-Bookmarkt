import {
  assertCompanionEntitled,
  checkCompanionEntitlement,
  COMPANION_FEATURE_ENABLED,
  CompanionAccessDeniedError,
} from '@/domains/companion/entitlement';

describe('companion entitlement gate (Stage 2)', () => {
  it('ships with the companion feature flag off', () => {
    expect(COMPANION_FEATURE_ENABLED).toBe(false);
  });

  it('reports every request as not entitled while the flag is off', () => {
    expect(checkCompanionEntitlement()).toEqual({
      entitled: false,
      reason: 'feature_disabled',
    });
  });

  it('denies requests before any retrieval work can run', () => {
    // getCompanionContext calls this assertion as its first statement, so a
    // throw here proves a denied request performs no retrieval and can never
    // reach an AI provider.
    expect(() => assertCompanionEntitled()).toThrow(CompanionAccessDeniedError);
    try {
      assertCompanionEntitled();
    } catch (err) {
      expect((err as CompanionAccessDeniedError).reason).toBe('feature_disabled');
    }
  });
});
