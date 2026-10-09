import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openSubscription, type PaywallSource } from '@/domains/billing/paywallSource';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

/**
 * The locked-state card for premium companion features. Shared by the Book
 * Club, Recall match, and story-so-far screens. It never decides access
 * itself - the caller renders it only after the server said "not entitled"
 * - and it hands off to the Subscription screen, where the free trial and
 * plans live (D-068). `source` names the lock the reader came from (D-086).
 */
export function PremiumOffer({
  title,
  body,
  source,
}: {
  title: string;
  body: string;
  source: PaywallSource;
}) {
  const router = useRouter();
  // Seeing the lock is the top of the paywall funnel (D-086).
  useEffect(() => {
    trackAnalyticsEvent('paywall_hit', { feature: source, reason: 'locked' });
  }, [source]);
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={18} color={gold.deep} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.body}>
          This is part of the Book Club plan. Your notes, character maps, and bookmarks stay free
          forever, subscription or not.
        </Text>
        <Pressable
          style={styles.pill}
          onPress={() => openSubscription(router, source)}
          accessibilityRole="button"
          accessibilityLabel="View plans and free trial"
        >
          <Text style={styles.pillText}>View plans</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: gold.glow,
    borderRadius: radii.card,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
    ...cardShadow,
  },
  lockBadge: {
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
    fontSize: 25,
    lineHeight: 32,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pill: {
    backgroundColor: colors.accent,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.button,
    borderRadius: radii.button,
    paddingHorizontal: spacing.lg,
  },
  pillText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 15,
  },
});
