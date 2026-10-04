import { checkPasswordRules, PASSWORD_RULES } from '@/domains/auth/passwordRules';
import { passwordPolicyError } from '@/domains/auth/policy';

describe('checkPasswordRules', () => {
  it('lists every rule unmet for an empty password', () => {
    expect(checkPasswordRules('').every((r) => !r.met)).toBe(true);
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(['length', 'case', 'number', 'symbol']);
  });

  it('ticks rules one by one', () => {
    const met = (p: string) =>
      checkPasswordRules(p)
        .filter((r) => r.met)
        .map((r) => r.rule.id);
    expect(met('alllowercase')).toEqual(['length']);
    expect(met('MixedCaseOnly')).toEqual(['length', 'case']);
    expect(met('MixedCase123')).toEqual(['length', 'case', 'number']);
    expect(met('Str0ng!Passw0rd')).toEqual(['length', 'case', 'number', 'symbol']);
  });

  it('agrees with passwordPolicyError', () => {
    for (const p of ['Sh0rt!pw', 'ALLUPPER123!!', 'NoNumbersHere!', 'NoSymbolsHere123', 'Str0ng!Passw0rd']) {
      const allMet = checkPasswordRules(p).every((r) => r.met);
      expect(allMet).toBe(passwordPolicyError(p) === null);
    }
  });
});
