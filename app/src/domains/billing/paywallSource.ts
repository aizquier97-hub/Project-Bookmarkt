import type { Router } from 'expo-router';

/**
 * Where a reader came from when the Subscription screen opened (D-086).
 * Carried as a route param and echoed on `subscription_viewed`, so the
 * paywall funnel can be read per entry point. Names only - never content.
 */
export const PAYWALL_SOURCES = [
  'settings',
  'club_lock',
  'match_lock',
  'summary_lock',
  'character_suggestions',
  'first_run_tour',
] as const;

export type PaywallSource = (typeof PAYWALL_SOURCES)[number];

export function normalizePaywallSource(value: unknown): PaywallSource | 'unknown' {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && (PAYWALL_SOURCES as readonly string[]).includes(candidate)
    ? (candidate as PaywallSource)
    : 'unknown';
}

/** Opens the Subscription screen with its source attached. */
export function openSubscription(router: Pick<Router, 'push'>, source: PaywallSource): void {
  router.push({ pathname: '/subscription', params: { source } });
}
