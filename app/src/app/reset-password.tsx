import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { updatePassword } from '@/domains/auth/service';
import { useAuth } from '@/domains/auth/AuthProvider';
import { KeyboardPane } from '@/components/KeyboardPane';
import { PasswordRules } from '@/components/PasswordRules';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

// Storing the session from the link is local work, so anything longer than
// this means the link never reached us and the reader should not keep waiting.
const VERIFY_TIMEOUT_MS = 12_000;

/**
 * Landing screen for the emailed recovery link. Lives outside the (auth)
 * group because a session appears mid-flow and must not trigger a redirect
 * before the user has chosen their new password. The link itself is handled
 * by AuthProvider (it is registered from launch, so a warm-start deep link
 * cannot slip past it); this screen only reflects that progress.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, initializing, authLink } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  const verifying =
    !timedOut &&
    !session &&
    (initializing || authLink.status === 'pending' || authLink.status === 'establishing');

  useEffect(() => {
    if (!verifying) {
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [verifying]);

  const problem = session
    ? null
    : authLink.status === 'error'
      ? authLink.error
      : timedOut
        ? 'Verifying is taking longer than expected. Check your connection, or request a new link.'
        : 'We could not read this reset link. Links work once and expire after an hour - request a new one and open it on this phone.';

  return (
    <KeyboardPane style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.form}>
        <Text style={styles.title}>
          {session ? 'Choose a new password' : verifying ? 'Checking your link' : "That link didn't work"}
        </Text>
        {session ? (
          <PasswordForm
            onDone={() => {
              router.replace('/');
            }}
          />
        ) : verifying ? (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.subtitle}>Verifying your reset link...</Text>
          </>
        ) : (
          <>
            <Text style={styles.error}>{problem}</Text>
            <Pressable
              style={styles.button}
              onPress={() => router.replace('/forgot-password')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Request a new link</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/sign-in')} accessibilityRole="button">
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardPane>
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
      <PasswordRules password={password} />
      <TextInput
        style={styles.input}
        placeholder="Confirm new password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoComplete="new-password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />
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
