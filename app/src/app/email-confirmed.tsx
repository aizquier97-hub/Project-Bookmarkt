import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { createSessionFromRecoveryUrl } from '@/domains/auth/service';
import { useAuth } from '@/domains/auth/AuthProvider';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * Landing screen for the emailed sign-up confirmation link. Supabase verifies
 * the token server-side and redirects here with a session in the URL fragment
 * (implicit flow); we store it and send the user straight into the library.
 * Lives outside the (auth) group so the group's session redirect does not
 * race the URL handling.
 */
export default function EmailConfirmedScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const { session } = useAuth();
  const [linkError, setLinkError] = useState<string | null>(null);
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) {
      return;
    }
    handledUrl.current = url;
    createSessionFromRecoveryUrl(url)
      .then((established) => {
        if (established) {
          router.replace('/');
        }
      })
      .catch((err) => {
        setLinkError(
          err instanceof Error
            ? err.message
            : 'This confirmation link is invalid or has expired.',
        );
      });
  }, [router, url]);

  // Already signed in (e.g., the link was opened twice): nothing left to do.
  useEffect(() => {
    if (session && !linkError) {
      router.replace('/');
    }
  }, [linkError, router, session]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.form}>
        <Text style={styles.title}>Confirming your email</Text>
        {linkError ? (
          <>
            <Text style={styles.error}>{linkError}</Text>
            <Text style={styles.subtitle}>
              Sign in with your email and password to receive a fresh confirmation link.
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace('/sign-in')}>
              <Text style={styles.buttonText}>Go to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.subtitle}>
              One moment... If nothing happens, open the link from the email on this phone.
            </Text>
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
