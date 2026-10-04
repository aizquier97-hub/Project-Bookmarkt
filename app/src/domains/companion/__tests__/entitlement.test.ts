import {
  ACTIVE_LAPSE_TOLERANCE_MS,
  assertCompanionEntitled,
  CompanionAccessDeniedError,
  foldEndReason,
  readLifecycle,
  resolveCompanionEntitlement,
  type CompanionEntitlementRow,
} from '@/domains/companion/entitlement';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-09-02T12:00:00Z');

const row = (patch: Partial<CompanionEntitlementRow> & { status: string }): CompanionEntitlementRow => ({
  trial_expires_at: null,
  ...patch,
});

describe('resolveCompanionEntitlement (Stage 4 gate, mirrors the server)', () => {
  it('denies when the reader has no entitlement row', () => {
    expect(resolveCompanionEntitlement(null, NOW)).toEqual({
      entitled: false,
      reason: 'no_subscription',
      lifecycle: readLifecycle(null),
    });
  });

  it('denies status none', () => {
    expect(resolveCompanionEntitlement(row({ status: 'none' }), NOW)).toMatchObject({
      entitled: false,
      reason: 'no_subscription',
    });
  });

  it('grants comped without any expiry check', () => {
    expect(
      resolveCompanionEntitlement(
        row({ status: 'comped', current_period_end: '2020-01-01T00:00:00Z' }),
        NOW,
      ),
    ).toMatchObject({ entitled: true, status: 'comped', trialExpiresAt: null });
  });

  it('grants active with no period end (lifetime or unknown)', () => {
    expect(resolveCompanionEntitlement(row({ status: 'active' }), NOW)).toMatchObject({
      entitled: true,
      status: 'active',
      trialExpiresAt: null,
    });
  });

  it('keeps active rows entitled through the lapse tolerance, then denies (D-068)', () => {
    const periodEnd = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      resolveCompanionEntitlement(row({ status: 'active', current_period_end: periodEnd }), NOW),
    ).toMatchObject({ entitled: true, status: 'active' });

    const lapsed = new Date(NOW.getTime() - ACTIVE_LAPSE_TOLERANCE_MS - 1000).toISOString();
    expect(
      resolveCompanionEntitlement(row({ status: 'active', current_period_end: lapsed }), NOW),
    ).toMatchObject({ entitled: false, reason: 'subscription_ended' });
  });

  it('grants a trial only while trial_expires_at is in the future', () => {
    const future = '2026-09-09T12:00:00Z';
    expect(
      resolveCompanionEntitlement(row({ status: 'trial', trial_expires_at: future }), NOW),
    ).toMatchObject({ entitled: true, status: 'trial', trialExpiresAt: future });
  });

  it('denies an expired trial, including a trial with no expiry recorded', () => {
    expect(
      resolveCompanionEntitlement(
        row({ status: 'trial', trial_expires_at: '2026-09-01T12:00:00Z' }),
        NOW,
      ),
    ).toMatchObject({ entitled: false, reason: 'trial_expired' });
    expect(resolveCompanionEntitlement(row({ status: 'trial' }), NOW)).toMatchObject({
      entitled: false,
      reason: 'trial_expired',
    });
  });

  it('denies expired and canceled subscriptions', () => {
    for (const status of ['expired', 'canceled']) {
      expect(resolveCompanionEntitlement(row({ status }), NOW)).toMatchObject({
        entitled: false,
        reason: 'subscription_ended',
      });
    }
  });

  it('treats an unknown status as not subscribed (fail closed)', () => {
    expect(resolveCompanionEntitlement(row({ status: 'mystery' }), NOW)).toMatchObject({
      entitled: false,
      reason: 'no_subscription',
    });
  });
});

describe('readLifecycle (D-068 subscription states)', () => {
  it('defaults to a renewing, issue-free lifecycle for a missing row', () => {
    expect(readLifecycle(null)).toEqual({
      periodEnd: null,
      willRenew: true,
      billingIssue: false,
      gracePeriodEnd: null,
      storePeriod: 'other',
      endReason: null,
      trialExpiresAt: null,
    });
  });

  it('reads a canceled-to-period-end active row', () => {
    expect(
      readLifecycle(
        row({
          status: 'active',
          current_period_end: '2026-10-01T00:00:00Z',
          will_renew: false,
          cancel_reason: 'UNSUBSCRIBE',
          period_type: 'NORMAL',
        }),
      ),
    ).toMatchObject({
      periodEnd: '2026-10-01T00:00:00Z',
      willRenew: false,
      billingIssue: false,
      storePeriod: 'normal',
      endReason: 'unsubscribed',
    });
  });

  it('flags a billing issue with its grace period while active', () => {
    expect(
      readLifecycle(
        row({
          status: 'active',
          billing_issue_detected_at: '2026-09-01T00:00:00Z',
          grace_period_expires_at: '2026-09-17T00:00:00Z',
        }),
      ),
    ).toMatchObject({ billingIssue: true, gracePeriodEnd: '2026-09-17T00:00:00Z' });
  });

  it('prefers the expiration reason once the row is expired and drops the billing flag', () => {
    expect(
      readLifecycle(
        row({
          status: 'expired',
          billing_issue_detected_at: '2026-09-01T00:00:00Z',
          cancel_reason: 'UNSUBSCRIBE',
          expiration_reason: 'BILLING_ERROR',
        }),
      ),
    ).toMatchObject({ billingIssue: false, endReason: 'billing_error' });
  });

  it('recognises the store intro period', () => {
    expect(readLifecycle(row({ status: 'active', period_type: 'TRIAL' })).storePeriod).toBe('trial');
    expect(readLifecycle(row({ status: 'active', period_type: 'INTRO' })).storePeriod).toBe('intro');
    expect(readLifecycle(row({ status: 'active', period_type: 'PREPAID' })).storePeriod).toBe('other');
  });
});

describe('foldEndReason', () => {
  it('folds the RevenueCat vocabulary and keeps unknown reasons as other', () => {
    expect(foldEndReason(null)).toBeNull();
    expect(foldEndReason('')).toBeNull();
    expect(foldEndReason('UNSUBSCRIBE')).toBe('unsubscribed');
    expect(foldEndReason('billing_error')).toBe('billing_error');
    expect(foldEndReason('CUSTOMER_SUPPORT')).toBe('refunded');
    expect(foldEndReason('SUBSCRIPTION_PAUSED')).toBe('paused');
    expect(foldEndReason('TRANSFER')).toBe('transferred');
    expect(foldEndReason('PRICE_INCREASE')).toBe('other');
    expect(foldEndReason('UNKNOWN')).toBe('other');
  });
});

describe('assertCompanionEntitled', () => {
  it('throws CompanionAccessDeniedError with the denial reason', () => {
    const denied = resolveCompanionEntitlement(row({ status: 'trial' }), NOW);
    expect(() => assertCompanionEntitled(denied)).toThrow(CompanionAccessDeniedError);
    try {
      assertCompanionEntitled(denied);
    } catch (err) {
      expect((err as CompanionAccessDeniedError).reason).toBe('trial_expired');
    }
  });

  it('passes silently when entitled', () => {
    expect(() =>
      assertCompanionEntitled(resolveCompanionEntitlement(row({ status: 'comped' }), NOW)),
    ).not.toThrow();
  });
});
