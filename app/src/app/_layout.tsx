import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Lora_400Regular } from '@expo-google-fonts/lora';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ToastProvider } from '@/components/toast';
import { AuthProvider } from '@/domains/auth/AuthProvider';
import { installGlobalCrashReporter, reportAppError } from '@/lib/crashReporting';
import { buttonShadow, colors, fonts } from '@/lib/theme';

// Record unhandled JS errors from the very first render.
installGlobalCrashReporter();

// Hold the splash until the bundled Lora/Inter faces are registered (D-089)
// so the first frame never flashes system fonts with different metrics.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
    fontSize: 25,
    lineHeight: 32,
  },
  message: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 24,
    ...buttonShadow,
  },
  buttonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 15,
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lora_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    if (fontsReady) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return null;
  }

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
