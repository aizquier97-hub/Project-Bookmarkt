import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { friendlyAuthMessage } from '@/domains/auth/policy';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

// Supabase sends at most one email per address per minute (auth.email
// max_frequency), so the resend button waits that long before it is offered.
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Full-screen confirmation that an auth email went out, shown in place of
 * the form that requested it so the instruction cannot be missed under the
 * fields. Used after sign-up (confirmation link) and forgot-password
 * (reset link).
 */
export function EmailSentCard({
  email,
  purpose,
  onResend,
  onChangeEmail,
  onBackToSignIn,
}: {
  email: string;
  purpose: 'confirm' | 'reset';
  /** Sends the same email again; rejections are shown in plain language. */
  onResend: () => Promise<void>;
  /** Returns to the form with the address editable (typo recovery). */
  onChangeEmail: () => void;
  onBackToSignIn: () => void;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    if (resending || cooldown > 0) {
      return;
    }
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await onResend();
      setNotice('Sent again - give it a minute to arrive.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(friendlyAuthMessage(err, 'Could not send the email. Try again shortly.'));
    } finally {
      setResending(false);
    }
  };

  const copy =
    purpose === 'confirm'
      ? {
          title: 'Check your email',
          lead: 'We sent a confirmation link to',
          action: 'Open the link on this phone to finish creating your account.',
          resend: 'Resend confirmation email',
        }
      : {
          title: 'Check your email',
          lead: 'We sent a password reset link to',
          action: 'Open the link on this phone - it brings you back here to choose a new password.',
          resend: 'Resend reset link',
        };

  const resendDisabled = resending || cooldown > 0;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.iconRing}>
        <Ionicons name="mail-unread-outline" size={36} color={gold.deep} />
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.lead}>{copy.lead}</Text>
      <Text style={styles.email} selectable>
        {email}
      </Text>
      <Text style={styles.action}>{copy.action}</Text>
      <Text style={styles.hint}>
        Nothing after a few minutes? Check your spam folder, then resend.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Pressable
        style={[styles.button, resendDisabled && styles.buttonDisabled]}
        onPress={resend}
        disabled={resendDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: resendDisabled }}
      >
        {resending ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.buttonText}>
            {cooldown > 0 ? `${copy.resend} in ${cooldown}s` : copy.resend}
          </Text>
        )}
      </Pressable>

      <View style={styles.links}>
        <Pressable onPress={onChangeEmail} accessibilityRole="button">
          <Text style={styles.link}>Wrong address? Change it</Text>
        </Pressable>
        <Pressable onPress={onBackToSignIn} accessibilityRole="button">
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: 'center',
    gap: 10,
    ...cardShadow,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: gold.glowSoft,
    borderColor: gold.base,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 26,
    textAlign: 'center',
  },
  lead: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  email: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  action: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 4,
  },
  hint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  notice: {
    fontFamily: fonts.sans,
    color: colors.accent,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    ...buttonShadow,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 16,
  },
  links: {
    marginTop: 6,
    gap: 10,
    alignItems: 'center',
  },
  link: {
    fontFamily: fonts.sans,
    color: colors.accent,
    fontSize: 15,
    textAlign: 'center',
  },
});
