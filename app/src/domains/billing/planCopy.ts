/**
 * Plan-button copy (D-069). Pure: reads the store's own pricing phases off
 * a RevenueCat product so the Subscription screen can say "7 days free,
 * then $7.99 per month" with numbers the store will actually charge -
 * nothing here is hard-coded, so a price or trial change in the Play
 * Console or App Store Connect shows up without a release.
 *
 * Google Play returns only the offers the signed-in account is eligible
 * for, so a missing free phase simply means no trial for this reader (used
 * already, or the base plan has none); the button then shows the price.
 */

export type TrialPeriodUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export interface FreeTrialPhase {
  unit: TrialPeriodUnit;
  value: number;
}

/** The slice of a RevenueCat `PurchasesStoreProduct` these helpers read. */
export interface StoreProductLike {
  price: number;
  // Google Play: the default option's pricing phases.
  defaultOption?: {
    freePhase: { billingPeriod: { unit: string; value: number } } | null;
  } | null;
  // App Store: a zero-priced introductory price is a free trial.
  introPrice?: {
    price: number;
    periodUnit: string;
    periodNumberOfUnits: number;
    cycles: number;
  } | null;
}

const UNITS: readonly TrialPeriodUnit[] = ['DAY', 'WEEK', 'MONTH', 'YEAR'];

function asUnit(unit: string): TrialPeriodUnit | null {
  const upper = unit.toUpperCase();
  return UNITS.includes(upper as TrialPeriodUnit) ? (upper as TrialPeriodUnit) : null;
}

/** Weeks read better as days ("7 days free", the way Play phrases it). */
function normalize(unit: TrialPeriodUnit, value: number): FreeTrialPhase {
  if (unit === 'WEEK') {
    return { unit: 'DAY', value: value * 7 };
  }
  return { unit, value };
}

/** The free-trial phase the store will apply to this purchase, or null. */
export function readFreeTrial(product: StoreProductLike | null | undefined): FreeTrialPhase | null {
  if (!product) {
    return null;
  }
  const free = product.defaultOption?.freePhase;
  if (free) {
    const unit = asUnit(free.billingPeriod.unit);
    if (unit && free.billingPeriod.value > 0) {
      return normalize(unit, free.billingPeriod.value);
    }
  }
  const intro = product.introPrice;
  if (intro && intro.price === 0 && intro.periodNumberOfUnits > 0) {
    const unit = asUnit(intro.periodUnit);
    if (unit) {
      return normalize(unit, intro.periodNumberOfUnits * Math.max(1, intro.cycles));
    }
  }
  return null;
}

/** "7 days free", "1 month free" - or null when there is no free phase. */
export function freeTrialLabel(phase: FreeTrialPhase | null): string | null {
  if (!phase || phase.value <= 0) {
    return null;
  }
  const word = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' }[phase.unit];
  return `${phase.value} ${word}${phase.value === 1 ? '' : 's'} free`;
}

export interface PricedPackageLike {
  packageType: string;
  price: number;
}

/**
 * Whole-percent saving of the yearly plan against twelve monthly charges,
 * or null when either plan is missing or the yearly one is not cheaper.
 */
export function annualSavingsPercent(packages: readonly PricedPackageLike[]): number | null {
  const monthly = packages.find((p) => p.packageType === 'MONTHLY' && p.price > 0);
  const annual = packages.find((p) => p.packageType === 'ANNUAL' && p.price > 0);
  if (!monthly || !annual) {
    return null;
  }
  const percent = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
  return percent > 0 ? percent : null;
}
