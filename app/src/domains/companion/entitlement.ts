/**
 * Companion entitlement (Stage 4 Phase 1 + D-068 lifecycle states). The
 * server-side `companion_entitlements` row is the source of truth: RLS lets
 * a reader see only their own row, and the companion Edge Function
 * re-checks the row on every request. The client's copy of the decision
 * only chooses which UI to render (chat vs. offer) - it can never grant
 * access, because the server gate runs regardless of what the client
 * believes.
 */

import { supabase } from '@/lib/supabase';

export type CompanionDenialReason = 'no_subscription' | 'trial_expired' | 'subscription_ended';

/**
 * How long an `active` row stays entitled past its recorded period end.
 * Mirrors ACTIVE_LAPSE_TOLERANCE_MS in supabase/functions/companion/index.ts.
 */
export const ACTIVE_LAPSE_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000;

/** Why a subscription ended, folded from RevenueCat's reason vocabulary. */
export type SubscriptionEndReason =
  | 'unsubscribed'
  | 'billing_error'
  | 'refunded'
  | 'paused'
  | 'transferred'
  | 'other';

export interface SubscriptionLifecycle {
  /** When the current (or last) paid period ends/ended; null for lifetime or unknown. */
  periodEnd: string | null;
  /** False once the reader turned auto-renew off (or the store paused it). */
  willRenew: boolean;
  /** A charge failed and the store is retrying; access continues through the grace period. */
  billingIssue: boolean;
  gracePeriodEnd: string | null;
  /** The store's own introductory trial/intro period, distinct from the Bookmarkt trial. */
  storePeriod: 'trial' | 'intro' | 'normal' | 'other';
  endReason: SubscriptionEndReason | null;
  /** The Bookmarkt trial's end, when one was ever started. */
  trialExpiresAt: string | null;
}

export type CompanionEntitlement =
  | {
      entitled: true;
      status: 'comped' | 'trial' | 'active';
      trialExpiresAt: string | null;
      lifecycle: SubscriptionLifecycle;
    }
  | { entitled: false; reason: CompanionDenialReason; lifecycle: SubscriptionLifecycle };

/** The columns the resolver needs from a companion_entitlements row. */
export interface CompanionEntitlementRow {
  status: string;
  trial_expires_at: string | null;
  current_period_end?: string | null;
  will_renew?: boolean | null;
  billing_issue_detected_at?: string | null;
  grace_period_expires_at?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  period_type?: string | null;
}

export const ENTITLEMENT_SELECT =
  'status, trial_expires_at, current_period_end, will_renew, billing_issue_detected_at, grace_period_expires_at, cancel_reason, expiration_reason, period_type' as const;

const DENIAL_MESSAGES: Record<CompanionDenialReason, string> = {
  no_subscription: 'The companion is part of the paid plan.',
  trial_expired: 'Your companion trial has ended.',
  subscription_ended: 'Your companion subscription has ended.',
};

export class CompanionAccessDeniedError extends Error {
  readonly reason: CompanionDenialReason;

  constructor(reason: CompanionDenialReason) {
    super(DENIAL_MESSAGES[reason]);
    this.name = 'CompanionAccessDeniedError';
    this.reason = reason;
  }
}

export function foldEndReason(reason: string | null | undefined): SubscriptionEndReason | null {
  switch ((reason ?? '').toUpperCase()) {
    case '':
      return null;
    case 'UNSUBSCRIBE':
      return 'unsubscribed';
    case 'BILLING_ERROR':
      return 'billing_error';
    case 'CUSTOMER_SUPPORT':
      return 'refunded';
    case 'SUBSCRIPTION_PAUSED':
      return 'paused';
    case 'TRANSFER':
      return 'transferred';
    default:
      return 'other';
  }
}

function storePeriod(periodType: string | null | undefined): SubscriptionLifecycle['storePeriod'] {
  switch ((periodType ?? '').toUpperCase()) {
    case 'TRIAL':
      return 'trial';
    case 'INTRO':
      return 'intro';
    case 'NORMAL':
      return 'normal';
    default:
      return 'other';
  }
}

export function readLifecycle(row: CompanionEntitlementRow | null | undefined): SubscriptionLifecycle {
  const ended = row?.status === 'expired' || row?.status === 'canceled';
  return {
    periodEnd: row?.current_period_end ?? null,
    willRenew: row?.will_renew ?? true,
    billingIssue: !ended && !!row?.billing_issue_detected_at,
    gracePeriodEnd: row?.grace_period_expires_at ?? null,
    storePeriod: storePeriod(row?.period_type),
    endReason: foldEndReason(ended ? (row?.expiration_reason ?? row?.cancel_reason) : row?.cancel_reason),
    trialExpiresAt: row?.trial_expires_at ?? null,
  };
}

/**
 * Pure decision: mirrors the Edge Function's gate exactly so the client
 * renders the same state the server would enforce. A missing row means the
 * reader has never had access ('none').
 */
export function resolveCompanionEntitlement(
  row: CompanionEntitlementRow | null | undefined,
  now: Date = new Date(),
): CompanionEntitlement {
  const status = row?.status ?? 'none';
  const lifecycle = readLifecycle(row);
  if (status === 'comped') {
    return { entitled: true, status, trialExpiresAt: null, lifecycle };
  }
  if (status === 'active') {
    const periodEndMs = row?.current_period_end ? new Date(row.current_period_end).getTime() : NaN;
    if (!Number.isFinite(periodEndMs) || periodEndMs + ACTIVE_LAPSE_TOLERANCE_MS > now.getTime()) {
      return { entitled: true, status, trialExpiresAt: null, lifecycle };
    }
    return { entitled: false, reason: 'subscription_ended', lifecycle };
  }
  if (status === 'trial') {
    const expiresAt = row?.trial_expires_at ?? null;
    if (expiresAt && new Date(expiresAt).getTime() > now.getTime()) {
      return { entitled: true, status: 'trial', trialExpiresAt: expiresAt, lifecycle };
    }
    return { entitled: false, reason: 'trial_expired', lifecycle };
  }
  if (status === 'expired' || status === 'canceled') {
    return { entitled: false, reason: 'subscription_ended', lifecycle };
  }
  return { entitled: false, reason: 'no_subscription', lifecycle };
}

/** Fetch the signed-in reader's entitlement row (RLS scopes it to them). */
export async function fetchCompanionEntitlement(): Promise<CompanionEntitlement> {
  const { data, error } = await supabase
    .from('companion_entitlements')
    .select(ENTITLEMENT_SELECT)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return resolveCompanionEntitlement(data);
}

export function assertCompanionEntitled(entitlement: CompanionEntitlement): void {
  if (!entitlement.entitled) {
    throw new CompanionAccessDeniedError(entitlement.reason);
  }
}
