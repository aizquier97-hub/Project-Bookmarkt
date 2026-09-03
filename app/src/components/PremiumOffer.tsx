import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, gold } from '@/lib/theme';

/**
 * The locked-state card for premium companion features (Phase-3 billing is
 * not live yet, so this explains the feature without a buy button). Shared
 * by the Book Club, Cue Cards, and story-so-far screens.
 */
export function PremiumOffer({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={18} color={gold.deep} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Text style={styles.body}>
          This is part of the paid plan. Subscriptions are coming soon — your notes and character
          maps stay free forever.
        </Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Coming soon</Text>
        </View>
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
