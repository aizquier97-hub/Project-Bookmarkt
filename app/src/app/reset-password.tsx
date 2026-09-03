import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createSessionFromRecoveryUrl, updatePassword } from '@/domains/auth/service';
import { useAuth } from '@/domains/auth/AuthProvider';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * Landing screen for the emailed recovery link. Lives outside the (auth)
 * group because a session appears mid-flow and must not trigger a redirect
 * before the user has chosen their new password.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const { session } = useAuth();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) {
      return;
    }
    handledUrl.current = url;
    createSessionFromRecoveryUrl(url)
      .then((established) => {
        if (established) {
          setLinkError(null);
          setReady(true);
        }
      })
      .catch((err) => {
        setLinkError(
          err instanceof Error ? err.message : 'This reset link is invalid or has expired.',
        );
      });
  }, [url]);

  // A live session also unlocks the form (e.g., the effect finished before render).
  const canSetPassword = ready || Boolean(session);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.form}>
        <Text style={styles.title}>Choose a new password</Text>
        {canSetPassword ? (
          <PasswordForm
            onDone={() => {
              router.replace('/');
            }}
          />
        ) : linkError ? (
          <>
            <Text style={styles.error}>{linkError}</Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/forgot-password')}
            >
              <Text style={styles.buttonText}>Request a new link</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.subtitle}>
              Verifying your reset link... If nothing happens, request a new link and open it on
              this phone.
            </Text>
            <Pressable onPress={() => router.replace('/forgot-password')}>
              <Text style={styles.link}>Request a new link</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the new password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Text style={styles.subtitle}>You are verified. Pick a new password for your account.</Text>
      <TextInput
        style={styles.input}
        placeholder="New password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete="new-password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
      <Text style={styles.policyHint}>
        At least 12 characters with an uppercase letter, lowercase letter, number, and symbol.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={submit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.buttonText}>Save new password</Text>
        )}
      </Pressable>
    </>
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
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  input: {
    fontFamily: fonts.serif,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  policyHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
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
  link: {
    fontFamily: fonts.serif,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 15,
  },
});
