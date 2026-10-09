import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { passwordPolicyError, resendSignUpEmail, signUp } from '@/domains/auth/service';
import { friendlyAuthMessage } from '@/domains/auth/policy';
import { EmailSentCard } from '@/components/EmailSentCard';
import { KeyboardPane } from '@/components/KeyboardPane';
import { PasswordRules } from '@/components/PasswordRules';
import { buttonShadow, colors, fonts } from '@/lib/theme';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Address the confirmation email went to; set once sign-up succeeds and
  // swaps the form for the "check your email" card.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const confirmationRedirect = Linking.createURL('/email-confirmed');

  const submit = async () => {
    if (submitting) {
      return;
    }
    setError(null);

    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email, password, confirmationRedirect);
      setSentTo(email.trim());
    } catch (err) {
      setError(friendlyAuthMessage(err, 'Signup failed. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <View style={styles.container}>
        <EmailSentCard
          email={sentTo}
          purpose="confirm"
          onResend={() => resendSignUpEmail(sentTo, confirmationRedirect)}
          onChangeEmail={() => {
            setSentTo(null);
            setPassword('');
            setConfirmPassword('');
          }}
          onBackToSignIn={() => router.replace('/sign-in')}
        />
      </View>
    );
  }

  return (
    <KeyboardPane style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Create account</Text>

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
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />
        <PasswordRules password={password} />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="new-password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {confirmPassword && confirmPassword !== password ? (
          <Text style={styles.hint}>Passwords do not match yet.</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.button}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </Pressable>

        <Link href="/sign-in" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </View>
    </KeyboardPane>
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
    textAlign: 'center',
    marginBottom: 12,
  },
  hint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  input: {
    fontFamily: fonts.sans,
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
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 14,
  },
  button: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    ...buttonShadow,
  },
  buttonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 16,
  },
  link: {
    fontFamily: fonts.sans,
    color: colors.accent,
    textAlign: 'center',
    marginTop: 12,
    fontSize: 15,
  },
});
