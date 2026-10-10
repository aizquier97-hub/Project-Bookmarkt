import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompanionStoryRecap } from '@/domains/companion/api';
import { cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

/**
 * The automatic "story thus far" card (D-094, after the Figma "Book hub ·
 * Premium" screen): a parchment card that writes itself the moment a member
 * opens the hub - no range to pick, no detail level, nothing to tap. One
 * short sentence per note for the last three notes, skimmable before a
 * sitting. While the recap is being written the card holds its place with a
 * spinner; a failure stays inline with a retry so the hub never jumps.
 */
export function StoryRecapCard({
  recap,
  loading,
  errorMessage,
  onRetry,
  onOpenFullRecap,
}: {
  recap: CompanionStoryRecap | null;
  loading: boolean;
  /** Set when the recap request failed; the card shows it with a retry action. */
  errorMessage: string | null;
  onRetry: () => void;
  /** Opens the longer, range-picking recap screen for readers who want more. */
  onOpenFullRecap?: () => void;
}) {
  const footerLabel = recap
    ? [
        'AI recap',
        recap.entryCount > 0
          ? `Last ${recap.entryCount === 1 ? 'entry' : `${recap.entryCount} entries`}`
          : null,
        recap.rangeLabel,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel="The story thus far">
      <View style={styles.header}>
        <Text style={styles.title}>The story thus far</Text>
        <Text style={styles.subtitle}>Your notes only · No spoilers</Text>
      </View>

      {recap ? (
        <Text style={styles.body}>{recap.content}</Text>
      ) : loading ? (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.pendingText}>Writing your recap…</Text>
        </View>
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <View style={styles.footer}>
        {footerLabel ? (
          <Text style={styles.footerText} numberOfLines={1}>
            {footerLabel}
          </Text>
        ) : errorMessage && !loading ? (
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Try writing the recap again"
          >
            <Text style={styles.linkText}>Try again</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {recap && onOpenFullRecap ? (
          <Pressable
            onPress={onOpenFullRecap}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open the longer recap"
          >
            <Text style={styles.linkText}>Longer recap ›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
    ...cardShadow,
  },
  header: { gap: 2 },
  title: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.text },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.text },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  pendingText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
  errorText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footerText: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, flexShrink: 1 },
  linkText: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 16, color: colors.accent },
});
