/**
 * The server-authorized companion trial (Stage 4 Phase 3, D-068). Both
 * calls are Postgres RPCs running as SECURITY DEFINER: the server decides
 * eligibility (once per account, only after the qualifying number of
 * entries exists) and writes the row; the client renders the answer and
 * never computes eligibility itself (D-047). The trial length and the
 * qualifying-entry count live in `companion_trial_policy`, tunable by the
 * owner without a release.
 */

import { supabase } from '@/lib/supabase';

export type TrialIneligibilityReason =
  | 'needs_entries'
  | 'trial_used'
  | 'entitled_already'
  | 'subscription_history';

export interface TrialEligibility {
  eligible: boolean;
  reason: 'eligible' | TrialIneligibilityReason;
  entriesLogged: number;
  entriesRequired: number;
  trialDays: number;
}

export interface TrialStartResult {
  started: boolean;
  reason: 'started' | TrialIneligibilityReason;
  trialExpiresAt: string | null;
  eligibility: Omit<TrialEligibility, 'eligible' | 'reason'>;
}

interface EligibilityRow {
  eligible: boolean;
  reason: string;
  entries_logged: number;
  entries_required: number;
  trial_days: number;
}

const INELIGIBILITY_REASONS: readonly TrialIneligibilityReason[] = [
  'needs_entries',
  'trial_used',
  'entitled_already',
  'subscription_history',
];

function foldReason(reason: string): TrialIneligibilityReason {
  return INELIGIBILITY_REASONS.includes(reason as TrialIneligibilityReason)
    ? (reason as TrialIneligibilityReason)
    : 'trial_used';
}

/** Pure mapping from the RPC row (also used by the tests). */
export function readTrialEligibility(row: EligibilityRow | null | undefined): TrialEligibility {
  if (!row) {
    return { eligible: false, reason: 'trial_used', entriesLogged: 0, entriesRequired: 0, trialDays: 0 };
  }
  return {
    eligible: row.eligible === true,
    reason: row.eligible === true ? 'eligible' : foldReason(row.reason),
    entriesLogged: row.entries_logged ?? 0,
    entriesRequired: row.entries_required ?? 0,
    trialDays: row.trial_days ?? 0,
  };
}

/** How many more entries unlock the trial (0 when the count is already met). */
export function entriesUntilTrial(eligibility: Pick<TrialEligibility, 'entriesLogged' | 'entriesRequired'>): number {
  return Math.max(0, eligibility.entriesRequired - eligibility.entriesLogged);
}

export async function fetchTrialEligibility(): Promise<TrialEligibility> {
  const { data, error } = await supabase.rpc('companion_trial_eligibility');
  if (error) {
    throw error;
  }
  return readTrialEligibility(Array.isArray(data) ? data[0] : data);
}

export async function startCompanionTrial(): Promise<TrialStartResult> {
  const { data, error } = await supabase.rpc('start_companion_trial');
  if (error) {
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The trial could not be started.');
  }
  return {
    started: row.started === true,
    reason: row.started === true ? 'started' : foldReason(row.reason),
    trialExpiresAt: row.trial_expires_at ?? null,
    eligibility: {
      entriesLogged: row.entries_logged ?? 0,
      entriesRequired: row.entries_required ?? 0,
      trialDays: row.trial_days ?? 0,
    },
  };
}
