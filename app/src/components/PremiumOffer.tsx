import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openSubscription, type PaywallSource } from '@/domains/billing/paywallSource';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { colors, fonts, gold } from '@/lib/theme';

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
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: gold.base,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    gap: 12,
    elevation: 3,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  lockBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: gold.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  pill: {
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 13,
    fontWeight: '700',
  },
});
