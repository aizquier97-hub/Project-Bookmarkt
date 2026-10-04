import { entriesUntilTrial, readTrialEligibility } from '@/domains/companion/trial';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('readTrialEligibility (D-068 server-authorized trial)', () => {
  it('maps an eligible row', () => {
    expect(
      readTrialEligibility({
        eligible: true,
        reason: 'eligible',
        entries_logged: 7,
        entries_required: 5,
        trial_days: 7,
      }),
    ).toEqual({
      eligible: true,
      reason: 'eligible',
      entriesLogged: 7,
      entriesRequired: 5,
      trialDays: 7,
    });
  });

  it('keeps the server reason when not eligible', () => {
    for (const reason of ['needs_entries', 'trial_used', 'entitled_already', 'subscription_history']) {
      expect(
        readTrialEligibility({
          eligible: false,
          reason,
          entries_logged: 1,
          entries_required: 5,
          trial_days: 7,
        }).reason,
      ).toBe(reason);
    }
  });

  it('fails closed to trial_used on an unknown reason or a missing row', () => {
    expect(
      readTrialEligibility({
        eligible: false,
        reason: 'mystery',
        entries_logged: 0,
        entries_required: 5,
        trial_days: 7,
      }).reason,
    ).toBe('trial_used');
    expect(readTrialEligibility(null)).toEqual({
      eligible: false,
      reason: 'trial_used',
      entriesLogged: 0,
      entriesRequired: 0,
      trialDays: 0,
    });
  });
});

describe('entriesUntilTrial', () => {
  it('counts the remaining entries and floors at zero', () => {
    expect(entriesUntilTrial({ entriesLogged: 2, entriesRequired: 5 })).toBe(3);
    expect(entriesUntilTrial({ entriesLogged: 5, entriesRequired: 5 })).toBe(0);
    expect(entriesUntilTrial({ entriesLogged: 9, entriesRequired: 5 })).toBe(0);
  });
});
