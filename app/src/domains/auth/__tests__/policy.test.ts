import { friendlyAuthMessage, passwordPolicyError } from '@/domains/auth/policy';

describe('friendlyAuthMessage', () => {
  it('translates invalid credentials to plain language', () => {
    expect(friendlyAuthMessage(new Error('Invalid login credentials'), 'fallback')).toBe(
      "That email and password don't match. Check both and try again.",
    );
  });

  it('translates unconfirmed email, duplicate account, and rate limits', () => {
    expect(friendlyAuthMessage(new Error('Email not confirmed'), 'f')).toBe(
      'Confirm your email first - look for our message in your inbox.',
    );
    expect(friendlyAuthMessage(new Error('User already registered'), 'f')).toBe(
      'That email already has an account. Sign in instead.',
    );
    expect(friendlyAuthMessage(new Error('Request rate limit reached'), 'f')).toBe(
      'Too many attempts - wait a minute, then try again.',
    );
  });

  it('translates connectivity failures', () => {
    expect(friendlyAuthMessage(new TypeError('Network request failed'), 'f')).toBe(
      'Could not reach Bookmarkt - check your connection and try again.',
    );
  });

  it('passes through unknown error messages and falls back for non-errors', () => {
    expect(friendlyAuthMessage(new Error('Weird edge case'), 'f')).toBe('Weird edge case');
    expect(friendlyAuthMessage('not-an-error', 'Use the fallback.')).toBe('Use the fallback.');
  });
});

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
