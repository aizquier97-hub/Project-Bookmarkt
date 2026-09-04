/**
 * RevenueCat billing (Stage 4 Phase 3). The store purchase is only ever a
 * *signal*: RevenueCat's webhook writes the server-authoritative
 * `companion_entitlements` row, and every companion request re-checks that
 * row (D-047). Nothing here grants access by itself.
 *
 * The native module ships only in binaries built with it (runtime >= 1.0.1),
 * so it is loaded lazily and every entry point degrades to 'unavailable'
 * instead of crashing older runtimes or Expo Go.
 */

import type PurchasesType from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';

// RevenueCat *publishable* SDK key (safe to ship in the app, like the
// Supabase anon key). Currently the Test Store key; swap for the goog_ key
// once the Play Store app is linked in RevenueCat.
const REVENUECAT_API_KEY = 'test_WzMWTIcJaHRlSYWivInmCqzNFWA';

export type BillingPackage = {
  identifier: string;
  title: string;
  priceString: string;
  periodLabel: string;
  raw: PurchasesPackage;
};

export type BillingOfferings =
  | { status: 'ready'; packages: BillingPackage[] }
  | { status: 'empty' }
  | { status: 'unavailable' };

export type PurchaseOutcome = 'completed' | 'cancelled';

let purchasesModule: typeof PurchasesType | null | undefined;
let configuredForUser: string | null = null;

async function loadPurchases(): Promise<typeof PurchasesType | null> {
  if (purchasesModule !== undefined) {
    return purchasesModule;
  }
  try {
    const mod = await import('react-native-purchases');
    purchasesModule = mod.default;
  } catch {
    // Native module absent (Expo Go or an older binary): billing is off.
    purchasesModule = null;
  }
  return purchasesModule;
}

/**
 * Configure RevenueCat with the Supabase user id as the app user id, so the
 * webhook can address the reader's entitlement row directly.
 */
export async function ensureBillingReady(userId: string): Promise<boolean> {
  const Purchases = await loadPurchases();
  if (!Purchases) {
    return false;
  }
  try {
    if (configuredForUser === null) {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
      configuredForUser = userId;
    } else if (configuredForUser !== userId) {
      await Purchases.logIn(userId);
      configuredForUser = userId;
    }
    return true;
  } catch {
    return false;
  }
}

/** Human label for a package's billing period. */
export function packagePeriodLabel(packageType: string): string {
  switch (packageType) {
    case 'MONTHLY':
      return 'per month';
    case 'ANNUAL':
      return 'per year';
    case 'WEEKLY':
      return 'per week';
    case 'THREE_MONTH':
      return 'every 3 months';
    case 'SIX_MONTH':
      return 'every 6 months';
    case 'LIFETIME':
      return 'one time';
    default:
      return '';
  }
}

/** The current offering's packages, ready to render. */
export async function fetchBillingOfferings(): Promise<BillingOfferings> {
  const Purchases = await loadPurchases();
  if (!Purchases || configuredForUser === null) {
    return { status: 'unavailable' };
  }
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  if (packages.length === 0) {
    return { status: 'empty' };
  }
  return {
    status: 'ready',
    packages: packages.map((pkg) => ({
      identifier: pkg.identifier,
      title: pkg.product.title,
      priceString: pkg.product.priceString,
      periodLabel: packagePeriodLabel(pkg.packageType),
      raw: pkg,
    })),
  };
}

/**
 * Run the store purchase sheet. Completion means the store accepted the
 * purchase - companion access itself arrives when the webhook activates the
 * server entitlement row moments later.
 */
export async function purchaseBillingPackage(pkg: BillingPackage): Promise<PurchaseOutcome> {
  const Purchases = await loadPurchases();
  if (!Purchases) {
    throw new Error('Billing is not available in this build.');
  }
  try {
    await Purchases.purchasePackage(pkg.raw);
    return 'completed';
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'userCancelled' in err && err.userCancelled) {
      return 'cancelled';
    }
    throw err;
  }
}

/** Re-sync past purchases (device change, reinstall). */
export async function restoreBillingPurchases(): Promise<void> {
  const Purchases = await loadPurchases();
  if (!Purchases) {
    throw new Error('Billing is not available in this build.');
  }
  await Purchases.restorePurchases();
}
