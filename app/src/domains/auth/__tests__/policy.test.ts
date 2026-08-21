import { passwordPolicyError } from '@/domains/auth/policy';

describe('passwordPolicyError', () => {
  it('accepts a compliant password', () => {
    expect(passwordPolicyError('Str0ng!Passw0rd')).toBeNull();
  });

  it('requires at least 12 characters', () => {
    expect(passwordPolicyError('Sh0rt!pw')).toBe('Password must be at least 12 characters.');
  });

  it('requires a lowercase letter', () => {
    expect(passwordPolicyError('ALLUPPER123!!')).toBe('Password must include a lowercase letter.');
  });

  it('requires an uppercase letter', () => {
    expect(passwordPolicyError('alllower123!!')).toBe('Password must include an uppercase letter.');
  });

  it('requires a number', () => {
    expect(passwordPolicyError('NoNumbersHere!')).toBe('Password must include a number.');
  });

  it('requires a symbol', () => {
    expect(passwordPolicyError('NoSymbolsHere123')).toBe('Password must include a symbol.');
  });
});
