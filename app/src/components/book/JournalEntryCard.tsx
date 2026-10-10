import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { buildBookmarkLabel, formatJournalCardHeader, splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import type { Entry } from '@/domains/entries/service';
import { cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

/**
 * One journal entry as a card (D-093, after the Figma "Journal first"
 * screens): day and page range in the header, a serif headline of up to
 * three lines (the companion's one-sentence summary since D-095), and a
 * footer that names what the headline is. Book Club readers see the
 * companion's summary ("Journal summary") or, before one exists, their own
 * first words ("Your words"). Free readers see a plain "Journal entry"
 * headline over a locked "Journal summary · Book Club" footer (D-094) -
 * the full entry is always one tap away.
 */
export function JournalEntryCard({
  entry,
  entitled,
  onPress,
}: {
  entry: Entry;
  entitled: boolean;
  onPress: () => void;
}) {
  const header = formatJournalCardHeader(entry);
  const kind = parseEntryKind(splitEntryText(entry.text).body).kind;
  const label = buildBookmarkLabel(entry);
  const headline = entitled ? label.text : 'Journal entry';
  const footerLabel = !entitled
    ? 'Journal summary · Book Club'
    : label.fromCompanion
      ? 'Journal summary'
      : 'Your words';
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open entry${header.day ? ` from ${header.day}` : ''}${
        header.position ? `, ${header.position}` : ''
      }`}
    >
      <View style={styles.header}>
        {header.day ? <Text style={styles.day}>{header.day}</Text> : null}
        <View style={styles.leader} />
        {kind === 'quote' ? (
          <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.muted} />
        ) : null}
        {header.position ? <Text style={styles.position}>{header.position}</Text> : null}
      </View>
      <Text style={[styles.headline, !entitled && styles.headlineLocked]} numberOfLines={3}>
        {headline || 'An empty entry'}
      </Text>
      <View style={styles.footer}>
        <View style={styles.footerLabelRow}>
          {!entitled ? <Ionicons name="lock-closed-outline" size={12} color={colors.muted} /> : null}
          <Text style={styles.footerLabel} numberOfLines={1}>
            {footerLabel}
          </Text>
        </View>
        <View style={styles.openRow}>
          <Text style={styles.openText}>Open full entry</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
    ...cardShadow,
  },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  day: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  leader: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  position: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  headline: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.text },
  headlineLocked: { color: colors.text },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  footerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  footerLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accent },
});
