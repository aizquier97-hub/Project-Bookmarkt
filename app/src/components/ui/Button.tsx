import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { buttonShadow, colors, fonts, radii, sizes, spacing } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /** primary = russet fill; secondary = off-white with russet outline; ghost = text only. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  /** Stretches to the container width (the default for footer actions). */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * Shared buttons (D-089). Primary actions are a russet fill with white
 * Inter SemiBold at 48pt / radius 8; secondary actions are the off-white
 * card surface with a russet outline. Pressed state is a gentle fade.
 */
export function Button({
  label,
  variant = 'primary',
  icon,
  iconPosition = 'left',
  loading = false,
  block = true,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'danger'
        ? colors.danger
        : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        block && styles.block,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon && iconPosition === 'left' ? (
            <Ionicons name={icon} size={18} color={textColor} />
          ) : null}
          <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
          {icon && iconPosition === 'right' ? (
            <Ionicons name={icon} size={18} color={textColor} />
          ) : null}
          {children}
        </>
      )}
    </Pressable>
  );
}

type CircleButtonProps = Omit<PressableProps, 'style'> & {
  icon: IconName;
  accessibilityLabel: string;
  variant?: 'primary' | 'secondary';
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** The circular russet action (e.g. the Quotes header "+"): 48 × 48, radius 24. */
export function CircleButton({
  icon,
  variant = 'primary',
  size = sizes.circleButton,
  style,
  ...rest
}: CircleButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        primary ? styles.circlePrimary : styles.circleSecondary,
        pressed && styles.pressed,
        style,
      ]}
      {...rest}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={primary ? colors.onAccent : colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: sizes.button,
    borderRadius: radii.button,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  block: { alignSelf: 'stretch' },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePrimary: {
    backgroundColor: colors.accent,
    ...buttonShadow,
  },
  circleSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
    ...buttonShadow,
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
  },
  danger: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
  },
});
