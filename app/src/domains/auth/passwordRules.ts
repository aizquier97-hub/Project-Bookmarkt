// The password policy as a checklist the sign-up and reset screens can show
// under the password field, each rule ticking as the reader satisfies it.
// Mirrors `passwordPolicyError`; both follow the Supabase project policy
// (minimum 12, lower_upper_letters_digits_symbols).
export type PasswordRule = {
  id: 'length' | 'case' | 'number' | 'symbol';
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 12 characters', test: (p) => p.length >= 12 },
  {
    id: 'case',
    label: 'Upper and lower case letters',
    test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'A symbol (e.g. ! ? # &)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function checkPasswordRules(password: string): { rule: PasswordRule; met: boolean }[] {
  return PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) }));
}
