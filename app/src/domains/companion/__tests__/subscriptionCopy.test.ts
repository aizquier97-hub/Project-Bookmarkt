import { resolveCompanionEntitlement } from '@/domains/companion/entitlement';
import {
  daysUntil,
  describeSubscriptionState,
  describeTrialOffer,
  formatSubscriptionDate,
} from '@/domains/companion/subscriptionCopy';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-09-02T12:00:00Z');
const PERIOD_END = '2026-10-01T12:00:00Z';
const PERIOD_END_TEXT = formatSubscriptionDate(PERIOD_END) as string;

const state = (row: Parameters<typeof resolveCompanionEntitlement>[0]) =>
  describeSubscriptionState(resolveCompanionEntitlement(row, NOW), NOW);

describe('describeSubscriptionState (D-068 subscription states)', () => {
  it('says nothing for a reader who never had access (the offer speaks instead)', () => {
    expect(state(null)).toBeNull();
    expect(state({ status: 'none', trial_expires_at: null })).toBeNull();
  });

  it('describes complimentary access', () => {
    expect(state({ status: 'comped', trial_expires_at: null })).toMatchObject({
      tone: 'active',
      title: 'Your access is active',
    });
  });

  it('describes the Bookmarkt trial with its end date and days left', () => {
    const card = state({ status: 'trial', trial_expires_at: '2026-09-05T12:00:00Z' });
    expect(card).toMatchObject({ tone: 'active', title: 'Your free trial is active' });
    expect(card?.body).toContain('3 days left');
  });

  it('describes a renewing subscription with its renewal date', () => {
    const card = state({
      status: 'active',
      trial_expires_at: null,
      current_period_end: PERIOD_END,
      will_renew: true,
      period_type: 'NORMAL',
    });
    expect(card).toMatchObject({ tone: 'active', title: 'Your subscription is active' });
    expect(card?.body).toContain(`renews on ${PERIOD_END_TEXT}`);
  });

  it('describes a canceled-to-period-end subscription without revoking anything', () => {
    const card = state({
      status: 'active',
      trial_expires_at: null,
      current_period_end: PERIOD_END,
      will_renew: false,
      cancel_reason: 'UNSUBSCRIBE',
    });
    expect(card).toMatchObject({ tone: 'warning', title: 'Your subscription will not renew' });
    expect(card?.body).toContain(`until ${PERIOD_END_TEXT}`);
  });

  it('describes a pause scheduled by the store', () => {
    expect(
      state({
        status: 'active',
        trial_expires_at: null,
        current_period_end: PERIOD_END,
        will_renew: false,
        cancel_reason: 'SUBSCRIPTION_PAUSED',
      }),
    ).toMatchObject({ tone: 'warning', title: 'Your subscription is set to pause' });
  });

  it('describes a payment issue through the grace period', () => {
    const card = state({
      status: 'active',
      trial_expires_at: null,
      current_period_end: '2026-09-17T12:00:00Z',
      will_renew: true,
      billing_issue_detected_at: '2026-09-01T12:00:00Z',
      grace_period_expires_at: '2026-09-17T12:00:00Z',
    });
    expect(card).toMatchObject({ tone: 'warning', title: 'Payment issue' });
    expect(card?.body).toContain(formatSubscriptionDate('2026-09-17T12:00:00Z'));
  });

  it("describes the store's own introductory period", () => {
    const card = state({
      status: 'active',
      trial_expires_at: null,
      current_period_end: PERIOD_END,
      will_renew: true,
      period_type: 'TRIAL',
    });
    expect(card).toMatchObject({ tone: 'active', title: 'Your introductory period is active' });
    expect(card?.body).toContain(`starts on ${PERIOD_END_TEXT}`);
  });

  it('describes an ended Bookmarkt trial', () => {
    const card = state({ status: 'trial', trial_expires_at: '2026-09-01T12:00:00Z' });
    expect(card).toMatchObject({ tone: 'ended', title: 'Your free trial has ended' });
    expect(card?.body).toContain('your notes never went anywhere');
  });

  it('describes ended subscriptions by reason', () => {
    const ended = (expiration_reason: string | null) =>
      state({
        status: 'expired',
        trial_expires_at: null,
        current_period_end: '2026-09-01T12:00:00Z',
        will_renew: false,
        expiration_reason,
      });
    expect(ended('UNSUBSCRIBE')).toMatchObject({ tone: 'ended', title: 'Your subscription has ended' });
    expect(ended('CUSTOMER_SUPPORT')).toMatchObject({ title: 'Your subscription was refunded' });
    expect(ended('BILLING_ERROR')).toMatchObject({
      title: 'Your subscription ended after a payment failed',
    });
    expect(ended('SUBSCRIPTION_PAUSED')).toMatchObject({ title: 'Your subscription is paused' });
    expect(ended(null)).toMatchObject({ title: 'Your subscription has ended' });
  });

  it('treats an active row lapsed past the tolerance as ended', () => {
    expect(
      state({
        status: 'active',
        trial_expires_at: null,
        current_period_end: '2026-08-01T12:00:00Z',
        will_renew: true,
      }),
    ).toMatchObject({ tone: 'ended', title: 'Your subscription has ended' });
  });
});

describe('describeTrialOffer', () => {
  const base = { entriesLogged: 0, entriesRequired: 5, trialDays: 7 };

  it('offers the trial when eligible', () => {
    const card = describeTrialOffer({ ...base, eligible: true, reason: 'eligible', entriesLogged: 6 });
    expect(card).toMatchObject({ kind: 'offer', title: 'Try the Book Club free for 7 days' });
    expect(card?.body).toContain('6 entries');
  });

  it('locks the trial behind the qualifying entries and counts the remainder', () => {
    const card = describeTrialOffer({ ...base, eligible: false, reason: 'needs_entries', entriesLogged: 3 });
    expect(card).toMatchObject({ kind: 'locked', title: 'Your free trial unlocks after 5 entries' });
    expect(card?.body).toContain('2 entries to go');
    expect(
      describeTrialOffer({ ...base, eligible: false, reason: 'needs_entries', entriesLogged: 4 })?.body,
    ).toContain('1 entry to go');
  });

  it('shows nothing once the trial is used, converted, or the reader is entitled', () => {
    for (const reason of ['trial_used', 'entitled_already', 'subscription_history'] as const) {
      expect(describeTrialOffer({ ...base, eligible: false, reason })).toBeNull();
    }
  });

  it('shows no card when the store trial on the plans is the trial (D-070)', () => {
    expect(
      describeTrialOffer({ ...base, eligible: false, reason: 'store_trial', entriesLogged: 9 }),
    ).toBeNull();
  });
});

describe('date helpers', () => {
  it('formats valid dates and returns null otherwise', () => {
    expect(formatSubscriptionDate(null)).toBeNull();
    expect(formatSubscriptionDate('not a date')).toBeNull();
    expect(formatSubscriptionDate(PERIOD_END)).toContain('2026');
  });

  it('counts whole days until a date, flooring at zero', () => {
    expect(daysUntil('2026-09-05T12:00:00Z', NOW)).toBe(3);
    expect(daysUntil('2026-09-02T18:00:00Z', NOW)).toBe(1);
    expect(daysUntil('2026-09-01T12:00:00Z', NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBeNull();
  });
});
