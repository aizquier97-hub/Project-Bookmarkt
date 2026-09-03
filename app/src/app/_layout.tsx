import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ToastProvider } from '@/components/toast';
import { AuthProvider } from '@/domains/auth/AuthProvider';
import { installGlobalCrashReporter, reportAppError } from '@/lib/crashReporting';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

// Record unhandled JS errors from the very first render.
installGlobalCrashReporter();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * Screen-level crash shield: a render error anywhere below the root shows
 * this recoverable card (and reports remotely) instead of killing the app.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    void reportAppError('screen_render', error);
  }, [error]);
  return (
    <View style={boundaryStyles.container}>
      <Text style={boundaryStyles.title}>Something went wrong</Text>
      <Text style={boundaryStyles.message}>
        This screen hit an error. It has been reported automatically - you can try again, and your
        books and entries are safe.
      </Text>
      <Text style={boundaryStyles.detail} numberOfLines={4}>
        {error.message}
      </Text>
      <Pressable
        style={boundaryStyles.button}
        onPress={() => void retry()}
        accessibilityRole="button"
      >
        <Text style={boundaryStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const boundaryStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
    ...buttonShadow,
  },
  buttonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 15,
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
