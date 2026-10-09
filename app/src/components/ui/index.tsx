import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardShadow, colors, fonts, radii, sizes, spacing } from '@/lib/theme';

export { AppHeader, HeaderAction } from './AppHeader';
export { Button, CircleButton } from './Button';

/** Off-white card surface: radius 16, padding 16, hairline russet border, soft shadow. */
export function Card({
  children,
  style,
  flat = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Flat cards keep the border and drop the shadow (dense lists, nested cards). */
  flat?: boolean;
}) {
  return <View style={[styles.card, !flat && cardShadow, style]}>{children}</View>;
}

/** Uppercase 12pt Inter Medium section label in secondary ink. */
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.sectionLabel, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Lora section heading (20pt) with an optional trailing action. */
export function SectionHeading({
  title,
  action,
  style,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeading, style]}>
      <Text style={styles.sectionHeadingText} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

type SegmentedOption<T extends string> = { value: T; label: string };

/** Secondary-surface track with an off-white selected pill. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmentTrack, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[styles.segmentText, selected && styles.segmentTextSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Filter chip: secondary surface at rest, russet fill when selected. */
export function Chip({
  label,
  selected = false,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal scrolling row of chips with the screen's outer padding. */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.chipRow, style]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Fixed action footer: parchment with a hairline top border, padded to the
 * bottom safe-area inset. Place it as a sibling after the scroll view.
 */
export function StickyFooter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionHeadingText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radii.field,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.field - 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentSelected: {
    backgroundColor: colors.card,
    ...cardShadow,
  },
  segmentText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.muted,
  },
  segmentTextSelected: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.chip,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.text,
  },
  chipTextSelected: {
    color: colors.onAccent,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
    minHeight: sizes.button + spacing.md * 2,
  },
  pressed: { opacity: 0.7 },
});
