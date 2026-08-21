/**
 * Companion entitlement gate (roadmap §11: "behind an entitlement-ready
 * service"). Stage 2 ships the retrieval foundation with the flag hard-off;
 * Stage 4 replaces the flag with real subscription entitlement checks.
 * Nothing downstream of a denied check may run — no retrieval, no provider.
 */

export const COMPANION_FEATURE_ENABLED = false as boolean;

export type CompanionDenialReason = 'feature_disabled' | 'not_entitled';

export type CompanionEntitlement =
  | { entitled: true }
  | { entitled: false; reason: CompanionDenialReason };

export class CompanionAccessDeniedError extends Error {
  readonly reason: CompanionDenialReason;

  constructor(reason: CompanionDenialReason) {
    super(
      reason === 'feature_disabled'
        ? 'The reading companion is not available yet.'
        : 'The reading companion requires an active subscription.',
    );
    this.name = 'CompanionAccessDeniedError';
    this.reason = reason;
  }
}

export function checkCompanionEntitlement(): CompanionEntitlement {
  if (!COMPANION_FEATURE_ENABLED) {
    return { entitled: false, reason: 'feature_disabled' };
  }
  // Stage 4: consult the user's subscription entitlement here.
  return { entitled: false, reason: 'not_entitled' };
}

export function assertCompanionEntitled(): void {
  const entitlement = checkCompanionEntitlement();
  if (!entitlement.entitled) {
    throw new CompanionAccessDeniedError(entitlement.reason);
  }
}
