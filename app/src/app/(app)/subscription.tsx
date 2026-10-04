import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/domains/auth/AuthProvider';
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
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * Companion subscription (Stage 4 Phase 3, D-061 + D-068 + D-069). The
 * purchase runs through the store sheet; access itself is granted
 * server-side when RevenueCat's webhook activates the reader's entitlement
 * row - this screen only ever renders what the server already decided
 * (D-047: no client-only entitlement decisions). Since D-069 the store's
 * free trial on each plan is the trial: the buttons read "7 days free, then
 * $7.99 per month" from the store's own pricing phases, and the plans stay
 * behind the entries-before-offer gate until the qualifying entries exist.
 * The no-card Bookmarkt trial (`start_companion_trial`) is a policy lever
 * that is currently off. A declined, canceled, or failed purchase changes
 * nothing: the reader is told so and stays right here.
 */
export default function SubscriptionScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

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
    });
  }, [entitlement]);

  const lockedViewedRef = useRef(false);
  useEffect(() => {
    const eligibility = eligibilityQuery.data;
    if (!eligibility || eligibility.eligible || eligibility.reason !== 'needs_entries') {
      return;
    }
    if (lockedViewedRef.current) {
      return;
    }
    lockedViewedRef.current = true;
    trackAnalyticsEvent('trial_locked_viewed', {
      entries_logged: eligibility.entriesLogged,
      entries_required: eligibility.entriesRequired,
    });
  }, [eligibilityQuery.data]);

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
            ? 'A few more entries first - the trial unlocks once the companion has notes to work from.'
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
  const trialCard = !entitled && eligibility ? describeTrialOffer(eligibility) : null;
  // The entries-before-offer rule (roadmap section 13): plans wait until the
  // companion has notes to work from. Readers with any subscription history
  // always see them; an eligibility hiccup fails open to the plans.
  const plansLocked =
    !entitled &&
    entitlement?.reason === 'no_subscription' &&
    trialCard?.kind === 'locked';
  const showPlans = !entitled || entitlement.status === 'trial';
  const readyPackages = offerings?.status === 'ready' ? offerings.packages : [];
  const savings = annualSavingsPercent(readyPackages);
  const anyStoreTrial = readyPackages.some((pkg) => pkg.trialLabel !== null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Subscription' }} />

      <View style={styles.card}>
        <View style={styles.badge}>
          <Ionicons name="book-outline" size={22} color={gold.deep} />
        </View>
        <Text style={styles.title}>The Book Club</Text>
        <Text style={styles.body}>
          Socratic discussions, retellings from your own notes, the Recall match, and search by
          meaning - all grounded in what you have written, never past where you have read.
        </Text>
        <Text style={styles.body}>
          Capturing notes, character maps, and bookmarks stays free forever, subscription or not.
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
          <Text style={[styles.statusTitle, statusCard.tone === 'active' && styles.activeTitle]}>
            {statusCard.title}
          </Text>
          <Text style={styles.body}>{statusCard.body}</Text>
        </View>
      ) : null}

      {trialCard ? (
        <View style={[styles.card, styles.trialCard]}>
          <View style={styles.trialHeader}>
            <Ionicons
              name={trialCard.kind === 'offer' ? 'sparkles-outline' : 'lock-closed-outline'}
              size={18}
              color={gold.deep}
            />
            <Text style={styles.trialTitle}>{trialCard.title}</Text>
          </View>
          <Text style={styles.body}>{trialCard.body}</Text>
          {trialCard.kind === 'locked' && trialCard.entriesRequired > 0 ? (
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: trialCard.entriesRequired,
                now: Math.min(trialCard.entriesLogged, trialCard.entriesRequired),
              }}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(
                      (Math.min(trialCard.entriesLogged, trialCard.entriesRequired) /
                        trialCard.entriesRequired) *
                        100,
                    )}%`,
                  },
                ]}
              />
            </View>
          ) : null}
          {trialCard.kind === 'offer' ? (
            <Pressable
              style={styles.planButton}
              onPress={() => void handleStartTrial()}
              disabled={startingTrial}
              accessibilityRole="button"
              accessibilityLabel="Start your free trial"
            >
              {startingTrial ? (
                <ActivityIndicator color={gold.onFill} />
              ) : (
                <Text style={styles.planPrice}>Start free trial</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showPlans && !plansLocked ? (
        <>
          <Text style={styles.sectionLabel}>Plans</Text>
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
                      <ActivityIndicator color={gold.onFill} />
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
              {anyStoreTrial ? (
                <Text style={styles.planNote}>
                  Your store runs the free trial: cancel before it ends from Google Play or the App
                  Store and nothing is charged. One trial per store account.
                </Text>
              ) : null}
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

      {entitled && entitlement.status !== 'trial' ? (
        <Text style={styles.manageHint}>
          Plan changes and cancellation happen in your store account (Google Play or the App
          Store); this screen reflects them within a few minutes.
        </Text>
      ) : null}

      <Pressable
        style={styles.restoreButton}
        onPress={() => void handleRestore()}
        disabled={restoring}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
      >
        {restoring ? (
          <ActivityIndicator size="small" color={colors.muted} />
        ) : (
          <Text style={styles.restoreText}>Restore purchases</Text>
        )}
      </Pressable>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
    ...cardShadow,
  },
  activeCard: {
    borderColor: gold.base,
  },
  warningCard: {
    borderColor: colors.accent,
  },
  endedCard: {
    borderColor: colors.border,
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
    fontSize: 16,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: gold.glowSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: gold.base,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: gold.glowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statusTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  activeTitle: {
    color: gold.deep,
  },
  body: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14.5,
    lineHeight: 21,
  },
  sectionLabel: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginLeft: 4,
  },
  planButton: {
    backgroundColor: gold.fill,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: gold.deep,
    paddingVertical: 14,
    alignItems: 'center',
    ...buttonShadow,
  },
  planPrice: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 18,
    fontWeight: '700',
  },
  planPeriod: {
    fontFamily: fonts.serif,
    color: gold.onFill,
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
    fontFamily: fonts.serif,
    color: gold.deep,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  planNote: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginHorizontal: 8,
    fontStyle: 'italic',
  },
  manageHint: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 14.5,
    fontWeight: '600',
  },
  notice: {
    fontFamily: fonts.serif,
    color: gold.deep,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 19,
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 19,
  },
});
