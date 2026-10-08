import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/domains/auth/AuthProvider';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

const VERIFY_TIMEOUT_MS = 12_000;

/**
 * Landing screen for the emailed sign-up confirmation link. Supabase verifies
 * the token server-side and redirects here with a session in the URL fragment
 * (implicit flow); AuthProvider stores it and this screen sends the reader
 * straight into the library. Lives outside the (auth) group so the group's
 * session redirect does not race the URL handling.
 */
export default function EmailConfirmedScreen() {
  const router = useRouter();
  const { session, initializing, authLink } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Supabase only redirects here after verifying the token, so the address is
  // confirmed regardless; the spinner shows only while the session carried in
  // the link is still being stored.
  const establishing =
    !timedOut &&
    (initializing || authLink.status === 'pending' || authLink.status === 'establishing');
  const linkError = authLink.status === 'error' ? authLink.error : null;

  useEffect(() => {
    if (!establishing) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [establishing]);

  // Signed in - from this link or already before it was opened.
  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [router, session]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.form}>
        <Text style={styles.title}>
          {establishing || linkError ? 'Confirming your email' : 'Email confirmed'}
        </Text>
        {linkError ? (
          <>
            <Text style={styles.error}>{linkError}</Text>
            <Text style={styles.subtitle}>
              Sign in with your email and password to receive a fresh confirmation link.
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/sign-in')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Go to sign in</Text>
            </Pressable>
          </>
        ) : establishing ? (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.subtitle}>One moment...</Text>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Your address is verified. Sign in with your email and password to open your library.
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/sign-in')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  form: {
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.serif,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...buttonShadow,
  },
  buttonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 16,
    fontWeight: '700',
  },
});
