import { friendlyLinkError, parseAuthLink, parseUrlParams } from '@/domains/auth/authLink';

describe('parseAuthLink', () => {
  it('reads a recovery session from the fragment (implicit flow)', () => {
    expect(
      parseAuthLink(
        'bookmarkt:///reset-password#access_token=a&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', type: 'recovery', accessToken: 'a', refreshToken: 'r' });
  });

  it('reads a sign-up session from query parameters too', () => {
    expect(
      parseAuthLink('bookmarkt:///email-confirmed?access_token=a&refresh_token=r&type=signup'),
    ).toEqual({ kind: 'tokens', type: 'signup', accessToken: 'a', refreshToken: 'r' });
  });

  it('labels unknown link types as other', () => {
    expect(parseAuthLink('bookmarkt:///x#access_token=a&refresh_token=r&type=weird')).toEqual({
      kind: 'tokens',
      type: 'other',
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('is none for a bare redirect or a half set of tokens', () => {
    expect(parseAuthLink('bookmarkt:///reset-password')).toEqual({ kind: 'none' });
    expect(parseAuthLink('bookmarkt:///reset-password#access_token=a')).toEqual({ kind: 'none' });
    expect(parseAuthLink('bookmarkt:///bookmark/ABC123')).toEqual({ kind: 'none' });
  });

  it('turns an expired-link redirect into a plain-language error', () => {
    expect(
      parseAuthLink(
        'bookmarkt:///reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({
      kind: 'error',
      type: 'other',
      message:
        'This link has expired or was already used. Request a new one and open it on this phone.',
    });
  });

  it('passes other Supabase error descriptions through with spaces restored', () => {
    expect(
      parseAuthLink('bookmarkt:///email-confirmed#error_description=Something+went+wrong&type=signup'),
    ).toEqual({ kind: 'error', type: 'signup', message: 'Something went wrong' });
  });

  it('treats an error as an error even when tokens are also present', () => {
    expect(
      parseAuthLink('bookmarkt:///x#access_token=a&refresh_token=r&error=access_denied').kind,
    ).toBe('error');
  });
});

describe('parseUrlParams', () => {
  it('merges query and fragment, letting the fragment win', () => {
    const params = parseUrlParams('bookmarkt:///x?type=query&only=q#type=fragment&token=t');
    expect(params.get('type')).toBe('fragment');
    expect(params.get('only')).toBe('q');
    expect(params.get('token')).toBe('t');
  });
});

describe('friendlyLinkError', () => {
  it('falls back to a generic message without details', () => {
    expect(friendlyLinkError(null, null)).toBe('This link is invalid or has expired.');
  });
});
