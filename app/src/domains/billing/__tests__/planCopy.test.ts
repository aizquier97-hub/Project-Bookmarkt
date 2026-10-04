import {
  annualSavingsPercent,
  freeTrialLabel,
  readFreeTrial,
} from '@/domains/billing/planCopy';

describe('readFreeTrial (D-069 store trial on the plans)', () => {
  it('reads the Play default option free phase', () => {
    expect(
      readFreeTrial({
        price: 7.99,
        defaultOption: { freePhase: { billingPeriod: { unit: 'DAY', value: 7 } } },
      }),
    ).toEqual({ unit: 'DAY', value: 7 });
  });

  it('normalizes a one-week phase to seven days', () => {
    expect(
      readFreeTrial({
        price: 59.99,
        defaultOption: { freePhase: { billingPeriod: { unit: 'WEEK', value: 1 } } },
      }),
    ).toEqual({ unit: 'DAY', value: 7 });
  });

  it('treats a zero-priced App Store introductory price as the free trial', () => {
    expect(
      readFreeTrial({
        price: 7.99,
        defaultOption: null,
        introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 },
      }),
    ).toEqual({ unit: 'DAY', value: 7 });
    expect(
      readFreeTrial({
        price: 59.99,
        introPrice: { price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 },
      }),
    ).toEqual({ unit: 'MONTH', value: 1 });
  });

  it('ignores paid introductory prices, empty phases, and missing products', () => {
    expect(
      readFreeTrial({
        price: 7.99,
        introPrice: { price: 3.99, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 3 },
      }),
    ).toBeNull();
    expect(readFreeTrial({ price: 7.99, defaultOption: { freePhase: null }, introPrice: null })).toBeNull();
    expect(
      readFreeTrial({
        price: 7.99,
        defaultOption: { freePhase: { billingPeriod: { unit: 'UNKNOWN', value: 7 } } },
      }),
    ).toBeNull();
    expect(readFreeTrial(null)).toBeNull();
    expect(readFreeTrial(undefined)).toBeNull();
  });
});

describe('freeTrialLabel', () => {
  it('phrases the phase the way the store does', () => {
    expect(freeTrialLabel({ unit: 'DAY', value: 7 })).toBe('7 days free');
    expect(freeTrialLabel({ unit: 'DAY', value: 1 })).toBe('1 day free');
    expect(freeTrialLabel({ unit: 'MONTH', value: 1 })).toBe('1 month free');
    expect(freeTrialLabel({ unit: 'MONTH', value: 3 })).toBe('3 months free');
  });

  it('returns null without a phase', () => {
    expect(freeTrialLabel(null)).toBeNull();
    expect(freeTrialLabel({ unit: 'DAY', value: 0 })).toBeNull();
  });
});

describe('annualSavingsPercent', () => {
  it('rounds the yearly saving against twelve monthly charges', () => {
    // The decided prices (D-069): 7.99 x 12 = 95.88 against 59.99.
    expect(
      annualSavingsPercent([
        { packageType: 'MONTHLY', price: 7.99 },
        { packageType: 'ANNUAL', price: 59.99 },
      ]),
    ).toBe(37);
  });

  it('is null when a plan is missing or the yearly plan is not cheaper', () => {
    expect(annualSavingsPercent([{ packageType: 'MONTHLY', price: 7.99 }])).toBeNull();
    expect(annualSavingsPercent([{ packageType: 'ANNUAL', price: 59.99 }])).toBeNull();
    expect(
      annualSavingsPercent([
        { packageType: 'MONTHLY', price: 4.99 },
        { packageType: 'ANNUAL', price: 59.99 },
      ]),
    ).toBeNull();
    expect(
      annualSavingsPercent([
        { packageType: 'MONTHLY', price: 0 },
        { packageType: 'ANNUAL', price: 59.99 },
      ]),
    ).toBeNull();
    expect(annualSavingsPercent([])).toBeNull();
  });
});
