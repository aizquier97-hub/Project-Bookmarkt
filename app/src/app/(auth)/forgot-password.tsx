import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
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

import { requestPasswordReset } from '@/domains/auth/service';
import { friendlyAuthMessage } from '@/domains/auth/policy';
import { colors, fonts } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sendLink = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email, Linking.createURL('/reset-password'));
      setLinkSent(true);
    } catch (err) {
      setError(friendlyAuthMessage(err, 'Could not send the recovery email.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Reset password' }} />
      <View style={styles.form}>
        <Text style={styles.title}>Reset your password</Text>

        {!linkSent ? (
          <>
            <Text style={styles.subtitle}>
              Enter your account email and we will send you a reset link.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.button} onPress={sendLink} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Check {email.trim() || 'your email'} and open the reset link on this phone. It will
              bring you back here to choose a new password.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.button} onPress={sendLink} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.buttonText}>Send the link again</Text>
              )}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
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
    color: colors.danger,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: colors.accent,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 15,
  },
});
