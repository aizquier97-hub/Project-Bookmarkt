import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/domains/auth/AuthProvider';
import {
  ensureBillingReady,
  fetchBillingOfferings,
  purchaseBillingPackage,
  restoreBillingPurchases,
  type BillingOfferings,
  type BillingPackage,
} from '@/domains/billing/purchases';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * Companion subscription (Stage 4 Phase 3). The purchase runs through the
 * store sheet; access itself is granted server-side when RevenueCat's
 * webhook activates the reader's entitlement row - this screen only ever
 * renders what the server already decided (D-047: no client-only
 * entitlement decisions).
 */
export default function SubscriptionScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [offerings, setOfferings] = useState<BillingOfferings | null>(null);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
  });
  const entitled = entitlementQuery.data?.entitled === true;

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

  const refreshEntitlement = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });

  const handlePurchase = async (pkg: BillingPackage) => {
    if (busyPackage) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusyPackage(pkg.identifier);
    try {
      const outcome = await purchaseBillingPackage(pkg);
      if (outcome === 'completed') {
        setNotice(
          'Purchase received. Your Book Club access activates within a few moments - pull back in if it has not appeared yet.',
        );
        // The webhook writes the row; give it a beat, then re-read.
        setTimeout(() => void refreshEntitlement(), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The purchase could not be completed.');
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
      setNotice('Restore requested. Any past purchase re-activates within a few moments.');
      setTimeout(() => void refreshEntitlement(), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchases could not be restored.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Subscription' }} />

      <View style={styles.card}>
        <View style={styles.badge}>
          <Ionicons name="book-outline" size={22} color={gold.deep} />
        </View>
        <Text style={styles.title}>The Book Club</Text>
        <Text style={styles.body}>
          Socratic discussions, retellings from your own notes, cue cards, and search by meaning -
          all grounded in what you have written, never past where you have read.
        </Text>
        <Text style={styles.body}>
          Capturing notes, character maps, and bookmarks stays free forever, subscription or not.
        </Text>
      </View>

      {entitled ? (
        <View style={[styles.card, styles.activeCard]}>
          <Text style={styles.activeTitle}>Your access is active</Text>
          <Text style={styles.body}>
            {entitlementQuery.data?.entitled && entitlementQuery.data.status === 'comped'
              ? 'This account has complimentary access.'
              : entitlementQuery.data?.entitled && entitlementQuery.data.status === 'trial'
                ? 'You are on a trial.'
                : 'Your subscription is active.'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Plans</Text>
      {offerings === null ? (
        <View style={styles.card}>
          <ActivityIndicator color={gold.base} />
        </View>
      ) : offerings.status === 'ready' ? (
        offerings.packages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            style={styles.planButton}
            onPress={() => void handlePurchase(pkg)}
            disabled={busyPackage !== null}
            accessibilityRole="button"
            accessibilityLabel={`Subscribe ${pkg.priceString} ${pkg.periodLabel}`}
          >
            {busyPackage === pkg.identifier ? (
              <ActivityIndicator color={gold.onFill} />
            ) : (
              <>
                <Text style={styles.planPrice}>{pkg.priceString}</Text>
                {pkg.periodLabel ? <Text style={styles.planPeriod}>{pkg.periodLabel}</Text> : null}
              </>
            )}
          </Pressable>
        ))
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
  activeTitle: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontSize: 16,
    fontWeight: '700',
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
  },
});
