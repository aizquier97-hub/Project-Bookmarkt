import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/domains/auth/AuthProvider';
import { subscriptionLegalLinks } from '@/domains/billing/legalLinks';
import { PAYWALL_FEATURES } from '@/domains/billing/paywallFeatures';
import { normalizePaywallSource } from '@/domains/billing/paywallSource';
import { annualSavingsPercent } from '@/domains/billing/planCopy';
import {
  ensureBillingReady,
  fetchBillingOfferings,
  purchaseBillingPackage,
  restoreBillingPurchases,
  type BillingOfferings,
  type BillingPackage,
} from '@/domains/billing/purchases';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import {
  describeSubscriptionState,
  describeTrialOffer,
  formatSubscriptionDate,
} from '@/domains/companion/subscriptionCopy';
import { fetchTrialEligibility, startCompanionTrial } from '@/domains/companion/trial';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

/**
 * Companion subscription paywall (Stage 4 Phase 3, D-061 + D-068 + D-070 +
 * D-074). The purchase runs through the store sheet; access itself is
 * granted server-side when RevenueCat's webhook activates the reader's
 * entitlement row - this screen only ever renders what the server already
 * decided (D-047: no client-only entitlement decisions). The store's free
 * trial on each plan is the trial: the buttons read "7 days free, then
 * $7.99 per month" from the store's own pricing phases. Since D-074 the
 * plans are always on offer - the entries-before-offer gate applies only to
 * the no-card Bookmarkt trial, a policy lever that is currently off. A
 * declined, canceled, or failed purchase changes nothing: the reader is
 * told so and stays right here.
 */
export default function SubscriptionScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  // Entry point attribution (D-086): which lock or link brought the reader.
  const params = useLocalSearchParams<{ source?: string }>();
  const source = normalizePaywallSource(params.source);

  const [offerings, setOfferings] = useState<BillingOfferings | null>(null);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
  });
  const entitlement = entitlementQuery.data ?? null;
  const entitled = entitlement?.entitled === true;

  const eligibilityQuery = useQuery({
    queryKey: queryKeys.companionTrialEligibility,
    queryFn: fetchTrialEligibility,
    enabled: entitlement !== null && !entitled,
  });

  const viewedRef = useRef(false);
  useEffect(() => {
    if (!entitlement || viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    trackAnalyticsEvent('subscription_viewed', {
      entitled: entitlement.entitled,
      state: entitlement.entitled ? entitlement.status : entitlement.reason,
      source,
    });
  }, [entitlement, source]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) {
        setOfferings({ status: 'unavailable' });
        return;
      }
      const ready = await ensureBillingReady(userId);
      if (cancelled) {
        return;
      }
      if (!ready) {
        setOfferings({ status: 'unavailable' });
        return;
      }
      try {
        const result = await fetchBillingOfferings();
        if (!cancelled) {
          setOfferings(result);
        }
      } catch {
        if (!cancelled) {
          setOfferings({ status: 'unavailable' });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshEntitlement = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
    void queryClient.invalidateQueries({ queryKey: queryKeys.companionTrialEligibility });
  };

  const handlePurchase = async (pkg: BillingPackage) => {
    if (busyPackage) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusyPackage(pkg.identifier);
    trackAnalyticsEvent('purchase_started', {
      package: pkg.identifier,
      period: pkg.periodLabel,
      store_trial: pkg.trialLabel !== null,
    });
    try {
      const outcome = await purchaseBillingPackage(pkg);
      if (outcome === 'completed') {
        trackAnalyticsEvent('purchase_completed', { package: pkg.identifier });
        setNotice(
          'Purchase received. Your Book Club access activates within a few moments - pull back in if it has not appeared yet.',
        );
        // The webhook writes the row; give it a beat, then re-read.
        setTimeout(() => refreshEntitlement(), 4000);
      } else {
        trackAnalyticsEvent('purchase_cancelled', { package: pkg.identifier });
        setNotice('No charge was made and nothing changed. Your notes are exactly where you left them.');
      }
    } catch (err) {
      trackAnalyticsEvent('purchase_failed', { package: pkg.identifier });
      setError(
        err instanceof Error && err.message
          ? `${err.message} Nothing was charged - you can try again or come back later.`
          : 'The purchase could not be completed. Nothing was charged - you can try again or come back later.',
      );
    } finally {
      setBusyPackage(null);
    }
  };

  const handleRestore = async () => {
    if (restoring) {
      return;
    }
    setError(null);
    setNotice(null);
    setRestoring(true);
    try {
      await restoreBillingPurchases();
      trackAnalyticsEvent('purchases_restored', {});
      setNotice('Restore requested. Any past purchase re-activates within a few moments.');
      setTimeout(() => refreshEntitlement(), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchases could not be restored.');
    } finally {
      setRestoring(false);
    }
  };

  const handleStartTrial = async () => {
    if (startingTrial) {
      return;
    }
    setError(null);
    setNotice(null);
    setStartingTrial(true);
    try {
      const result = await startCompanionTrial();
      if (result.started) {
        trackAnalyticsEvent('trial_started', { trial_days: result.eligibility.trialDays });
        const ends = formatSubscriptionDate(result.trialExpiresAt);
        setNotice(
          ends
            ? `Your free trial has started - the Book Club is open until ${ends}.`
            : 'Your free trial has started - the Book Club is open.',
        );
      } else {
        setNotice(
          result.reason === 'needs_entries'
            ? 'A few more entries first - the no-card trial unlocks once the companion has notes to work from. The plans below are open now.'
            : result.reason === 'store_trial'
              ? 'The free trial comes with the plans below - your store runs it, and nothing is charged until it ends.'
              : 'This account has already used its trial. Plans are below whenever you are ready.',
        );
      }
      refreshEntitlement();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trial could not be started.');
    } finally {
      setStartingTrial(false);
    }
  };

  const statusCard = entitlement ? describeSubscriptionState(entitlement) : null;
  const eligibility = eligibilityQuery.data ?? null;
  // Only the no-card Bookmarkt trial *offer* gets a card; its entries gate
  // (the "locked" kind) is never shown - plans are always open (D-074).
  const trialOffer = !entitled && eligibility ? describeTrialOffer(eligibility) : null;
  const showTrialOffer = trialOffer?.kind === 'offer';
  const showPlans = !entitled || entitlement.status === 'trial';
  const readyPackages = offerings?.status === 'ready' ? offerings.packages : [];
  const savings = annualSavingsPercent(readyPackages);
  const anyStoreTrial = readyPackages.some((pkg) => pkg.trialLabel !== null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Subscription' }} />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Ionicons name="book-outline" size={26} color={colors.accent} />
        </View>
        <Text style={styles.title}>Join the Book Club</Text>
        <Text style={styles.tagline}>
          A reading companion that works only from what you have written - and never reads ahead
          of your bookmark.
        </Text>
      </View>

      {entitlementQuery.isPending ? (
        <View style={styles.card}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : null}

      {statusCard ? (
        <View
          style={[
            styles.card,
            statusCard.tone === 'active' && styles.activeCard,
            statusCard.tone === 'warning' && styles.warningCard,
            statusCard.tone === 'ended' && styles.endedCard,
          ]}
          accessibilityRole="summary"
        >
          <View style={styles.statusHeader}>
            <Ionicons
              name={
                statusCard.tone === 'active'
                  ? 'checkmark-circle-outline'
                  : statusCard.tone === 'warning'
                    ? 'alert-circle-outline'
                    : 'time-outline'
              }
              size={22}
              color={statusCard.tone === 'active' ? gold.deep : colors.accent}
            />
            <Text style={[styles.statusTitle, statusCard.tone === 'active' && styles.activeTitle]}>
              {statusCard.title}
            </Text>
          </View>
          <Text style={styles.body}>{statusCard.body}</Text>
        </View>
      ) : null}

      <View style={styles.table} accessibilityRole="list">
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeading, styles.featureHeading]}>What you get</Text>
          <Text style={[styles.tableHeading, styles.tierHeading]}>Free</Text>
          <Text style={[styles.tableHeading, styles.tierHeading, styles.premiumHeading]}>
            Book Club
          </Text>
        </View>
        {PAYWALL_FEATURES.map((feature, index) => (
          <View
            key={feature.id}
            style={[
              styles.tableRow,
              !feature.free && styles.premiumRow,
              index === PAYWALL_FEATURES.length - 1 && styles.lastRow,
            ]}
            accessibilityLabel={`${feature.label}: ${feature.free ? 'free and Book Club' : 'Book Club only'}`}
          >
            <View style={styles.featureColumn}>
              <Text style={[styles.featureLabel, !feature.free && styles.premiumLabel]}>
                {feature.label}
              </Text>
              {feature.detail ? <Text style={styles.featureDetail}>{feature.detail}</Text> : null}
            </View>
            <View style={styles.tierColumn}>
              {feature.free ? (
                <Ionicons name="checkmark" size={18} color={colors.muted} />
              ) : (
                <Text style={styles.dash}>{'\u2014'}</Text>
              )}
            </View>
            <View style={styles.tierColumn}>
              <Ionicons name="checkmark-circle" size={22} color={gold.base} />
            </View>
          </View>
        ))}
      </View>

      {showTrialOffer && trialOffer ? (
        <View style={[styles.card, styles.trialCard]}>
          <View style={styles.trialHeader}>
            <Ionicons name="sparkles-outline" size={18} color={gold.deep} />
            <Text style={styles.trialTitle}>{trialOffer.title}</Text>
          </View>
          <Text style={styles.body}>{trialOffer.body}</Text>
          <Pressable
            style={styles.planButton}
            onPress={() => void handleStartTrial()}
            disabled={startingTrial}
            accessibilityRole="button"
            accessibilityLabel="Start your free trial"
          >
            {startingTrial ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.planPrice}>Start free trial</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {showPlans ? (
        <>
          <Text style={styles.sectionLabel}>Choose a plan</Text>
          {offerings === null ? (
            <View style={styles.card}>
              <ActivityIndicator color={gold.base} />
            </View>
          ) : offerings.status === 'ready' ? (
            <>
              {offerings.packages.map((pkg) => {
                const showSavings = pkg.packageType === 'ANNUAL' && savings !== null;
                const label = pkg.trialLabel
                  ? `Start ${pkg.trialLabel}, then ${pkg.priceString} ${pkg.periodLabel}`
                  : `Subscribe ${pkg.priceString} ${pkg.periodLabel}`;
                return (
                  <Pressable
                    key={pkg.identifier}
                    style={styles.planButton}
                    onPress={() => void handlePurchase(pkg)}
                    disabled={busyPackage !== null}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showSavings ? `${label}, save ${savings} percent against monthly` : label
                    }
                  >
                    {busyPackage === pkg.identifier ? (
                      <ActivityIndicator color={colors.onAccent} />
                    ) : (
                      <View style={styles.planRow}>
                        <View style={styles.planText}>
                          {pkg.trialLabel ? (
                            <>
                              <Text style={styles.planPrice}>{pkg.trialLabel}</Text>
                              <Text style={styles.planPeriod}>
                                then {pkg.priceString}
                                {pkg.periodLabel ? ` ${pkg.periodLabel}` : ''}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.planPrice}>{pkg.priceString}</Text>
                              {pkg.periodLabel ? (
                                <Text style={styles.planPeriod}>{pkg.periodLabel}</Text>
                              ) : null}
                            </>
                          )}
                        </View>
                        {showSavings ? (
                          <View style={styles.saveBadge}>
                            <Text style={styles.saveBadgeText}>Save {savings}%</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </Pressable>
                );
              })}
              <Text style={styles.planNote}>
                {anyStoreTrial
                  ? 'Your store runs the free trial: cancel before it ends from Google Play or the App Store and nothing is charged. One trial per store account. '
                  : ''}
                Cancel any time from your store account.
              </Text>
            </>
          ) : offerings.status === 'empty' ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                No plans are on offer right now. Check back soon - your notes are safe either way.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.body}>
                Purchases are not available in this build. Update the app to subscribe.
              </Text>
            </View>
          )}
        </>
      ) : null}

      <Text style={styles.freeForever}>
        Capturing notes, character maps, and bookmarks stays free forever, subscription or not.
      </Text>

      {entitled && entitlement.status !== 'trial' ? (
        <Text style={styles.manageHint}>
          Plan changes and cancellation happen in your store account (Google Play or the App
          Store); this screen reflects them within a few minutes.
        </Text>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.restoreButton}
        onPress={() => void handleRestore()}
        disabled={restoring}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        accessibilityHint="Reconnects a subscription bought on another device or before reinstalling"
      >
        {restoring ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text style={styles.restoreText}>
            Already subscribed on another device? <Text style={styles.restoreLink}>Restore purchases</Text>
          </Text>
        )}
      </Pressable>

      <View style={styles.legalRow}>
        {subscriptionLegalLinks(Platform.OS).map((link, index) => (
          <View key={link.id} style={styles.legalItem}>
            {index > 0 ? <Text style={styles.legalDot}>·</Text> : null}
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(link.url)}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              hitSlop={8}
            >
              <Text style={styles.legalLink}>{link.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  hero: {
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: gold.glowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 32,
    lineHeight: 40,
  },
  tagline: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...cardShadow,
  },
  activeCard: {
    borderColor: gold.base,
    backgroundColor: gold.glowSoft,
  },
  warningCard: {
    borderColor: colors.accent,
  },
  endedCard: {
    borderColor: colors.border,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface2,
  },
  tableHeading: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  premiumHeading: {
    color: colors.accent,
  },
  featureHeading: {
    flex: 1,
  },
  tierHeading: {
    width: 64,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  premiumRow: {
    backgroundColor: gold.glowSoft,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  featureColumn: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  tierColumn: {
    width: 64,
    alignItems: 'center',
  },
  featureLabel: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  premiumLabel: {
    fontFamily: fonts.sansSemiBold,
  },
  featureDetail: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  dash: {
    fontFamily: fonts.sans,
    color: colors.border,
    fontSize: 16,
  },
  trialCard: {
    borderColor: gold.base,
    borderWidth: 1.5,
  },
  trialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trialTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
  },
  statusTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeTitle: {
    color: colors.accent,
  },
  body: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginLeft: 4,
  },
  planButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    minHeight: sizes.button,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...buttonShadow,
  },
  planPrice: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 18,
  },
  planPeriod: {
    fontFamily: fonts.sans,
    color: colors.onAccent,
    fontSize: 13,
    marginTop: 2,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  planText: {
    alignItems: 'center',
  },
  saveBadge: {
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: gold.deep,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  saveBadgeText: {
    fontFamily: fonts.sansSemiBold,
    color: gold.deep,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  planNote: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  freeForever: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginHorizontal: 8,
    marginTop: 4,
  },
  manageHint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  restoreText: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  restoreLink: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingBottom: 4,
  },
  legalItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legalDot: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    marginHorizontal: 8,
  },
  legalLink: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12.5,
    textDecorationLine: 'underline',
  },
  notice: {
    fontFamily: fonts.sans,
    color: gold.deep,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 19,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.danger,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 19,
  },
});
