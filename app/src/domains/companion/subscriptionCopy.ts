import type { CompanionEntitlement } from '@/domains/companion/entitlement';
import type { TrialEligibility } from '@/domains/companion/trial';
import { entriesUntilTrial } from '@/domains/companion/trial';

/**
 * Subscription-screen copy (D-068). Pure: turns the server-rendered
 * entitlement row into the status card's words, so every lifecycle state
 * (renewing, canceled-to-period-end, payment issue in grace, store intro
 * trial, Bookmarkt trial, expired for each reason) has a tested sentence.
 */

export interface StatusCard {
  tone: 'active' | 'warning' | 'ended';
  title: string;
  body: string;
}

export function formatSubscriptionDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function entries(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

/** The status card, or null when the reader has never had access (the offer speaks instead). */
export function describeSubscriptionState(
  entitlement: CompanionEntitlement,
  now: Date = new Date(),
): StatusCard | null {
  const { lifecycle } = entitlement;
  const periodEnd = formatSubscriptionDate(lifecycle.periodEnd);

  if (entitlement.entitled) {
    if (entitlement.status === 'comped') {
      return {
        tone: 'active',
        title: 'Your access is active',
        body: 'This account has complimentary access to the Book Club.',
      };
    }
    if (entitlement.status === 'trial') {
      const ends = formatSubscriptionDate(entitlement.trialExpiresAt);
      const days = daysUntil(entitlement.trialExpiresAt, now);
      const left = days === null ? '' : ` (${plural(days, 'day')} left)`;
      return {
        tone: 'active',
        title: 'Your free trial is active',
        body: ends
          ? `It ends on ${ends}${left}. Subscribe before then to keep the Book Club; nothing happens to your notes either way.`
          : 'Subscribe before it ends to keep the Book Club; nothing happens to your notes either way.',
      };
    }
    if (lifecycle.billingIssue) {
      const until = formatSubscriptionDate(lifecycle.gracePeriodEnd ?? lifecycle.periodEnd);
      return {
        tone: 'warning',
        title: 'Payment issue',
        body: until
          ? `Your last charge did not go through. Update the payment method in your store account before ${until} to keep the Book Club.`
          : 'Your last charge did not go through. Update the payment method in your store account to keep the Book Club.',
      };
    }
    if (!lifecycle.willRenew) {
      if (lifecycle.endReason === 'paused') {
        return {
          tone: 'warning',
          title: 'Your subscription is set to pause',
          body: periodEnd
            ? `Access continues until ${periodEnd}, then pauses. Resume it any time from your store's subscriptions page.`
            : 'Access continues to the end of the period, then pauses. Resume it any time from your store\u2019s subscriptions page.',
        };
      }
      return {
        tone: 'warning',
        title: 'Your subscription will not renew',
        body: periodEnd
          ? `Access continues until ${periodEnd}. To keep going after that, turn renewal back on from your store's subscriptions page.`
          : 'Access continues to the end of the current period. To keep going after that, turn renewal back on from your store\u2019s subscriptions page.',
      };
    }
    if (lifecycle.storePeriod === 'trial' || lifecycle.storePeriod === 'intro') {
      return {
        tone: 'active',
        title: 'Your introductory period is active',
        body: periodEnd
          ? `Regular billing starts on ${periodEnd} unless you cancel before then from your store's subscriptions page.`
          : 'Regular billing starts when the introductory period ends unless you cancel before then.',
      };
    }
    return {
      tone: 'active',
      title: 'Your subscription is active',
      body: periodEnd
        ? `It renews on ${periodEnd}. Manage or cancel it any time from your store's subscriptions page.`
        : 'Manage or cancel it any time from your store\u2019s subscriptions page.',
    };
  }

  if (entitlement.reason === 'trial_expired') {
    const ended = formatSubscriptionDate(lifecycle.trialExpiresAt);
    return {
      tone: 'ended',
      title: 'Your free trial has ended',
      body: ended
        ? `It ended on ${ended}. Subscribe to pick the Book Club back up - your notes never went anywhere.`
        : 'Subscribe to pick the Book Club back up - your notes never went anywhere.',
    };
  }
  if (entitlement.reason === 'subscription_ended') {
    const endedOn = periodEnd ? ` on ${periodEnd}` : '';
    switch (lifecycle.endReason) {
      case 'refunded':
        return {
          tone: 'ended',
          title: 'Your subscription was refunded',
          body: `The store refunded it${endedOn}, so Book Club access ended. Subscribe again any time - your notes are untouched.`,
        };
      case 'billing_error':
        return {
          tone: 'ended',
          title: 'Your subscription ended after a payment failed',
          body: `The store could not complete the charge${endedOn ? `; access ended${endedOn}` : ''}. Resubscribe with a working payment method to continue.`,
        };
      case 'paused':
        return {
          tone: 'ended',
          title: 'Your subscription is paused',
          body: `Resume it from your store's subscriptions page to pick the Book Club back up. Your notes are untouched.`,
        };
      default:
        return {
          tone: 'ended',
          title: 'Your subscription has ended',
          body: `It ended${endedOn}. Subscribe again any time - your notes never went anywhere.`,
        };
    }
  }
  return null;
}

export interface TrialCard {
  kind: 'offer' | 'locked';
  title: string;
  body: string;
  entriesLogged: number;
  entriesRequired: number;
}

/** The trial card, or null when no trial can be offered (used, converted, entitled). */
export function describeTrialOffer(eligibility: TrialEligibility): TrialCard | null {
  if (eligibility.eligible) {
    return {
      kind: 'offer',
      title: `Try the Book Club free for ${plural(eligibility.trialDays, 'day')}`,
      body: `You have logged ${entries(eligibility.entriesLogged)} - enough for the companion to work from. One trial per account, no card needed, nothing to cancel.`,
      entriesLogged: eligibility.entriesLogged,
      entriesRequired: eligibility.entriesRequired,
    };
  }
  if (eligibility.reason === 'needs_entries') {
    const remaining = entriesUntilTrial(eligibility);
    return {
      kind: 'locked',
      title: `Your free trial unlocks after ${entries(eligibility.entriesRequired)}`,
      body: `The Book Club works from your own notes, so it opens once there is something to talk about. ${entries(remaining)} to go.`,
      entriesLogged: eligibility.entriesLogged,
      entriesRequired: eligibility.entriesRequired,
    };
  }
  return null;
}
