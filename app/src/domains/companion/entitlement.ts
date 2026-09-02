/**
 * Companion entitlement (Stage 4 Phase 1). The server-side
 * `companion_entitlements` row is the source of truth: RLS lets a reader
 * see only their own row, and the companion Edge Function re-checks the
 * row on every request. The client's copy of the decision only chooses
 * which UI to render (chat vs. offer) — it can never grant access,
 * because the server gate runs regardless of what the client believes.
 */

import { supabase } from '@/lib/supabase';

export type CompanionDenialReason = 'no_subscription' | 'trial_expired' | 'subscription_ended';

export type CompanionEntitlement =
  | { entitled: true; status: 'comped' | 'trial' | 'active'; trialExpiresAt: string | null }
  | { entitled: false; reason: CompanionDenialReason };

/** The columns the resolver needs from a companion_entitlements row. */
export interface CompanionEntitlementRow {
  status: string;
  trial_expires_at: string | null;
}

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
  if (status === 'comped' || status === 'active') {
    return { entitled: true, status, trialExpiresAt: null };
  }
  if (status === 'trial') {
    const expiresAt = row?.trial_expires_at ?? null;
    if (expiresAt && new Date(expiresAt).getTime() > now.getTime()) {
      return { entitled: true, status: 'trial', trialExpiresAt: expiresAt };
    }
    return { entitled: false, reason: 'trial_expired' };
  }
  if (status === 'expired' || status === 'canceled') {
    return { entitled: false, reason: 'subscription_ended' };
  }
  return { entitled: false, reason: 'no_subscription' };
}

/** Fetch the signed-in reader's entitlement row (RLS scopes it to them). */
export async function fetchCompanionEntitlement(): Promise<CompanionEntitlement> {
  const { data, error } = await supabase
    .from('companion_entitlements')
    .select('status, trial_expires_at')
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
