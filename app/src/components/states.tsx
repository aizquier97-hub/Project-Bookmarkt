import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { isLikelyNetworkError } from '@/lib/networkErrors';
import { colors } from '@/lib/theme';

/**
 * Shared request-state components (roadmap §11 "standardize loading, empty,
 * and error states"). Screens render these instead of ad-hoc blocks so the
 * whole app degrades the same way.
 */

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.block}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={styles.mutedText}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({
  error,
  fallback,
  onRetry,
}: {
  error: unknown;
  fallback: string;
  onRetry?: () => void;
}) {
  // Connectivity drops get a friendly, actionable message instead of the
  // raw "Network request failed" (Stage 3 offline pass).
  const offline = isLikelyNetworkError(error);
  const message = offline
    ? 'You seem to be offline. Check your connection and try again — nothing was lost.'
    : error instanceof Error && error.message
      ? error.message
      : fallback;
  return (
    <View style={styles.block}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={28}
        color={offline ? colors.muted : colors.danger}
      />
      <Text style={offline ? styles.mutedText : styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          style={styles.retryButton}
          onPress={onRetry}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.mutedText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 10,
  },
  mutedText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  retryText: {
    color: colors.text,
    fontWeight: '600',
  },
});
