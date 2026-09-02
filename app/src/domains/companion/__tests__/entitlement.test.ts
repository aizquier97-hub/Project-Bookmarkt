import {
  assertCompanionEntitled,
  CompanionAccessDeniedError,
  resolveCompanionEntitlement,
} from '@/domains/companion/entitlement';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-09-02T12:00:00Z');

describe('resolveCompanionEntitlement (Stage 4 gate, mirrors the server)', () => {
  it('denies when the reader has no entitlement row', () => {
    expect(resolveCompanionEntitlement(null, NOW)).toEqual({
      entitled: false,
      reason: 'no_subscription',
    });
  });

  it('denies status none', () => {
    expect(resolveCompanionEntitlement({ status: 'none', trial_expires_at: null }, NOW)).toEqual({
      entitled: false,
      reason: 'no_subscription',
    });
  });

  it('grants comped and active without any expiry check', () => {
    expect(resolveCompanionEntitlement({ status: 'comped', trial_expires_at: null }, NOW)).toEqual({
      entitled: true,
      status: 'comped',
      trialExpiresAt: null,
    });
    expect(resolveCompanionEntitlement({ status: 'active', trial_expires_at: null }, NOW)).toEqual({
      entitled: true,
      status: 'active',
      trialExpiresAt: null,
    });
  });

  it('grants a trial only while trial_expires_at is in the future', () => {
    const future = '2026-09-09T12:00:00Z';
    expect(
      resolveCompanionEntitlement({ status: 'trial', trial_expires_at: future }, NOW),
    ).toEqual({ entitled: true, status: 'trial', trialExpiresAt: future });
  });

  it('denies an expired trial, including a trial with no expiry recorded', () => {
    expect(
      resolveCompanionEntitlement(
        { status: 'trial', trial_expires_at: '2026-09-01T12:00:00Z' },
        NOW,
      ),
    ).toEqual({ entitled: false, reason: 'trial_expired' });
    expect(resolveCompanionEntitlement({ status: 'trial', trial_expires_at: null }, NOW)).toEqual({
      entitled: false,
      reason: 'trial_expired',
    });
  });

  it('denies expired and canceled subscriptions', () => {
    for (const status of ['expired', 'canceled']) {
      expect(resolveCompanionEntitlement({ status, trial_expires_at: null }, NOW)).toEqual({
        entitled: false,
        reason: 'subscription_ended',
      });
    }
  });

  it('treats an unknown status as not subscribed (fail closed)', () => {
    expect(
      resolveCompanionEntitlement({ status: 'mystery', trial_expires_at: null }, NOW),
    ).toEqual({ entitled: false, reason: 'no_subscription' });
  });
});

describe('assertCompanionEntitled', () => {
  it('throws CompanionAccessDeniedError with the denial reason', () => {
    expect(() =>
      assertCompanionEntitled({ entitled: false, reason: 'trial_expired' }),
    ).toThrow(CompanionAccessDeniedError);
    try {
      assertCompanionEntitled({ entitled: false, reason: 'trial_expired' });
    } catch (err) {
      expect((err as CompanionAccessDeniedError).reason).toBe('trial_expired');
    }
  });

  it('passes silently when entitled', () => {
    expect(() =>
      assertCompanionEntitled({ entitled: true, status: 'comped', trialExpiresAt: null }),
    ).not.toThrow();
  });
});
