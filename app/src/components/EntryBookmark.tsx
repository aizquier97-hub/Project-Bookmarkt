import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EntryKind } from '@/domains/entries/markers';
import { colors, fonts, gold } from '@/lib/theme';

const RIBBON_HEIGHT = 64;

/**
 * One entry as a horizontal bookmark ribbon (Interface v2.0): card-stock
 * strip with a notched tail cut into the right edge, a one-line summary on
 * the ribbon, and the position/date caption beneath it. Tapping opens the
 * full entry on its own paper. Quotes and flagged entries keep their accent
 * via the spine stripe on the left edge.
 */
export function EntryBookmark({
  label,
  caption,
  kind,
  important,
  onPress,
}: {
  label: string;
  caption: string;
  kind: EntryKind;
  important: boolean;
  onPress: () => void;
}) {
  const spineColor = important ? gold.base : kind === 'quote' ? colors.accent : colors.border;
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.ribbon, pressed && styles.ribbonPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Bookmark: ${label}`}
        accessibilityHint="Opens the full entry"
      >
        <View style={[styles.spine, { backgroundColor: spineColor }]} />
        <View style={styles.body}>
          <Text style={styles.label} numberOfLines={2}>
            {label || 'A blank bookmark'}
          </Text>
        </View>
        {important ? (
          <Ionicons name="flag" size={13} color={gold.deep} style={styles.flagIcon} />
        ) : kind === 'quote' ? (
          <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.accent} style={styles.flagIcon} />
        ) : null}
        {/* The notched bookmark tail: a background-colored triangle cuts a V
            into the right edge of the card stock. */}
        <View style={styles.notch} pointerEvents="none" />
      </Pressable>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  ribbon: {
    height: RIBBON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  ribbonPressed: {
    opacity: 0.75,
  },
  spine: {
    width: 5,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    // Room for the notch cut so text never sits under it.
    paddingRight: 30,
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  flagIcon: {
    position: 'absolute',
    top: 6,
    right: 26,
  },
  notch: {
    position: 'absolute',
    right: -1,
    top: '50%',
    marginTop: -(RIBBON_HEIGHT / 2),
    width: 0,
    height: 0,
    borderTopWidth: RIBBON_HEIGHT / 2,
    borderBottomWidth: RIBBON_HEIGHT / 2,
    borderRightWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: colors.background,
  },
  caption: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 6,
  },
});
