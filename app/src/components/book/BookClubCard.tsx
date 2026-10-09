import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, gold, radii, spacing } from '@/lib/theme';

/**
 * The walnut Book Club card (D-093): gold "BOOK CLUB" pill, serif title, a
 * one-line body, and a footer row - a lock with "Unlock with Book Club" for
 * free readers, or the open action for members. The whole card is the tap
 * target; both states lead to the same screen, which handles entitlement.
 */
export function BookClubCard({
  title,
  body,
  entitled,
  openLabel,
  lockedNote,
  onPress,
}: {
  title: string;
  body: string;
  entitled: boolean;
  /** Footer action for members, e.g. "Read the recap". */
  openLabel: string;
  /** Muted note on the right of the locked footer, e.g. "Your notes only · No spoilers". */
  lockedNote?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${entitled ? openLabel : 'Unlock with Book Club'}`}
    >
      <View style={styles.pill}>
        <Text style={styles.pillText}>BOOK CLUB</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.footer}>
        <View style={styles.footerAction}>
          {entitled ? (
            <Ionicons name="sparkles-outline" size={14} color={gold.base} />
          ) : (
            <View style={styles.lock}>
              <Ionicons name="lock-closed-outline" size={12} color={colors.onWalnut} />
            </View>
          )}
          <Text style={styles.footerText}>{entitled ? openLabel : 'Unlock with Book Club'}</Text>
          {entitled ? <Ionicons name="chevron-forward" size={14} color={gold.base} /> : null}
        </View>
        {!entitled && lockedNote ? (
          <Text style={styles.footerNote} numberOfLines={1}>
            {lockedNote}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.walnut,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.9 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: gold.fill,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: gold.onFill,
  },
  title: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.onWalnut },
  body: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.onWalnutMuted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  footerAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  lock: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.walnutBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: gold.base },
  footerNote: { fontFamily: fonts.sans, fontSize: 12, color: colors.onWalnutMuted, flexShrink: 1 },
});
