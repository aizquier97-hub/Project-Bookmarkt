import { StyleSheet, Text, View } from 'react-native';

import { checkPasswordRules } from '@/domains/auth/passwordRules';
import { colors, fonts } from '@/lib/theme';

/** Bullet list of the password rules, each ticking as the reader types. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={styles.list} accessibilityRole="list">
      {checkPasswordRules(password).map(({ rule, met }) => (
        <View key={rule.id} style={styles.row}>
          <Text
            style={[styles.bullet, met && styles.met]}
            accessibilityLabel={met ? 'done' : 'required'}
          >
            {met ? '\u2713' : '\u2022'}
          </Text>
          <Text style={[styles.label, met && styles.met]}>{rule.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bullet: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    width: 12,
    textAlign: 'center',
  },
  label: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
  },
  met: {
    color: colors.accent,
  },
});
