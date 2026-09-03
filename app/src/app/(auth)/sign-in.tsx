import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { signIn } from '@/domains/auth/service';
import { friendlyAuthMessage } from '@/domains/auth/policy';
import { KeyboardPane } from '@/components/KeyboardPane';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      // Redirect happens via the (auth) layout when the session appears.
    } catch (err) {
      setError(friendlyAuthMessage(err, 'Sign-in failed. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardPane style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Bookmarkt</Text>
        <Text style={styles.subtitle}>Your reading, in your own words.</Text>

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
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={submit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Link href="/sign-up" style={styles.link}>
          New here? Create an account
        </Link>
        <Link href="/forgot-password" style={styles.link}>
          Forgot your password?
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
    fontSize: 38,
    fontFamily: fonts.serif,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
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
    marginTop: 12,
    fontSize: 15,
  },
});
