import { hasSessionTokens, isRecoveryUrl } from '@/domains/auth/service';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('hasSessionTokens', () => {
  it('is true when both tokens ride in the fragment (implicit flow)', () => {
    expect(
      hasSessionTokens('bookmarkt:///email-confirmed#access_token=a&refresh_token=r&type=signup'),
    ).toBe(true);
  });

  it('is true when both tokens arrive as query parameters', () => {
    expect(hasSessionTokens('bookmarkt:///email-confirmed?access_token=a&refresh_token=r')).toBe(
      true,
    );
  });

  it('is false for a bare redirect or a half set of tokens', () => {
    expect(hasSessionTokens('bookmarkt:///email-confirmed')).toBe(false);
    expect(hasSessionTokens('bookmarkt:///email-confirmed#access_token=a')).toBe(false);
    expect(hasSessionTokens('bookmarkt:///email-confirmed#error_description=Link+expired')).toBe(
      false,
    );
  });
});

describe('isRecoveryUrl', () => {
  it('recognises recovery links, token fragments, and error redirects', () => {
    expect(isRecoveryUrl('bookmarkt:///reset-password#type=recovery')).toBe(true);
    expect(isRecoveryUrl('bookmarkt:///reset-password#access_token=a')).toBe(true);
    expect(isRecoveryUrl('bookmarkt:///reset-password#error_description=x')).toBe(true);
    expect(isRecoveryUrl('bookmarkt:///library')).toBe(false);
  });
});
