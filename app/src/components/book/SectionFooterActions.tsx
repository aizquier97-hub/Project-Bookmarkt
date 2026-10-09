import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii, sizes, spacing } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * The section screens' sticky footer row (D-093): one russet primary action
 * that takes the width, and an optional 48×48 outlined square beside it for
 * the voice twin of the same action (J6: speaking as present as typing).
 */
export function SectionFooterActions({
  primaryLabel,
  primaryIcon,
  onPrimary,
  primaryDisabled,
  squareIcon,
  squareLabel,
  onSquare,
}: {
  primaryLabel: string;
  primaryIcon?: IconName;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  squareIcon?: IconName;
  squareLabel?: string;
  onSquare?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Button
        label={primaryLabel}
        icon={primaryIcon}
        onPress={onPrimary}
        disabled={primaryDisabled}
        style={styles.primary}
      />
      {squareIcon && onSquare ? (
        <Pressable
          onPress={onSquare}
          style={({ pressed }) => [styles.square, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={squareLabel ?? primaryLabel}
        >
          <Ionicons name={squareIcon} size={20} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'stretch' },
  primary: { flex: 1 },
  square: {
    width: sizes.button,
    height: sizes.button,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
