import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, sizes, spacing } from '@/lib/theme';

type AppHeaderProps = {
  title: string;
  /** Large (32) for tab roots; detail (25) for pushed screens. */
  variant?: 'large' | 'detail';
  onBack?: () => void;
  /** "Library" / "Book": renders "‹ Label" beside the arrow; the screen then owns its title (D-093). */
  backLabel?: string;
  right?: ReactNode;
  /** Overrides the variant's title size (Settings uses 36). */
  titleSize?: number;
  /** Set when the screen renders its own status-bar spacing. */
  ignoreInsets?: boolean;
};

/**
 * The shared screen header (D-089): a left-aligned Lora title on parchment,
 * a russet back arrow when the screen can go back, and an optional text or
 * icon action on the right. The navigators mount it through their `header`
 * option so every screen inherits the same chrome; screens still set their
 * title and `headerRight` through `Stack.Screen` options as before.
 */
export function AppHeader({
  title,
  variant = 'detail',
  onBack,
  backLabel,
  right,
  titleSize,
  ignoreInsets = false,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const large = variant === 'large';
  const sizeOverride = titleSize ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.25) } : null;
  return (
    <View style={[styles.root, { paddingTop: (ignoreInsets ? 0 : insets.top) + spacing.sm }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={[styles.back, backLabel ? styles.backLabelled : styles.backIconOnly]}
          accessibilityRole="button"
          accessibilityLabel={backLabel ? `Back to ${backLabel}` : 'Go back'}
        >
          <Ionicons name={backLabel ? 'chevron-back' : 'arrow-back'} size={24} color={colors.accent} />
          {backLabel ? (
            <Text style={styles.backLabel} numberOfLines={1}>
              {backLabel}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {title ? (
        <Text
          style={[styles.title, large ? styles.titleLarge : styles.titleDetail, sizeOverride]}
          accessibilityRole="header"
          numberOfLines={2}
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** A plain text action for the header's right slot ("Edit", "Dismiss", "+ Add book"). */
export function HeaderAction({
  label,
  onPress,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  back: {
    height: sizes.touch,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconOnly: {
    width: sizes.touch,
  },
  // The labelled form sizes to its text. It must never carry the icon-only
  // fixed width: overriding `width` with `undefined` in the style array did
  // not reliably clear it on Android, so the label was squeezed into the
  // leftover ~10 pt and showed as "Boo / k" (D-095) and then "Lib…" (D-097).
  // The width now lives only on the icon-only form, and neither the row nor
  // the label may shrink beside the flex:1 title slot.
  backLabelled: {
    flexDirection: 'row',
    flexShrink: 0,
    paddingRight: spacing.sm,
    gap: 2,
  },
  backLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.accent,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontFamily: fonts.serif,
    color: colors.text,
  },
  titleLarge: {
    fontSize: 32,
    lineHeight: 40,
  },
  titleDetail: {
    fontSize: 25,
    lineHeight: 32,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  action: {
    minHeight: sizes.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.accent,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
