// Pure parsing of the deep links Supabase redirects to after verifying an
// emailed token (implicit flow). The redirect carries either a session in
// the URL fragment or an error, e.g.
//   bookmarkt:///reset-password#access_token=...&refresh_token=...&type=recovery
//   bookmarkt:///reset-password#error=access_denied&error_code=otp_expired&error_description=...
// Kept free of React and the Supabase client so it is unit-testable.

export type AuthLinkType =
  | 'recovery'
  | 'signup'
  | 'magiclink'
  | 'email_change'
  | 'invite'
  | 'other';

export type AuthLink =
  | { kind: 'none' }
  | { kind: 'tokens'; type: AuthLinkType; accessToken: string; refreshToken: string }
  | { kind: 'error'; type: AuthLinkType; message: string };

export function parseAuthLink(url: string): AuthLink {
  const params = parseUrlParams(url);
  const type = linkType(params.get('type'));
  const errorCode = params.get('error_code');
  const errorDescription = params.get('error_description');
  if (errorCode || errorDescription || params.get('error')) {
    return { kind: 'error', type, message: friendlyLinkError(errorCode, errorDescription) };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', type, accessToken, refreshToken };
  }
  return { kind: 'none' };
}

/** Merges query and fragment parameters; the fragment wins on conflicts. */
export function parseUrlParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  const [withoutFragment, fragment] = url.split('#');
  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex >= 0) {
    new URLSearchParams(withoutFragment.slice(queryIndex + 1)).forEach((value, key) => {
      merged.set(key, value);
    });
  }
  if (fragment) {
    new URLSearchParams(fragment).forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}

function linkType(raw: string | null): AuthLinkType {
  switch (raw) {
    case 'recovery':
    case 'signup':
    case 'magiclink':
    case 'email_change':
    case 'invite':
      return raw;
    default:
      return 'other';
  }
}

/** Plain-language version of the error Supabase appends to the redirect. */
export function friendlyLinkError(code: string | null, description: string | null): string {
  if (code === 'otp_expired') {
    return 'This link has expired or was already used. Request a new one and open it on this phone.';
  }
  if (description) {
    // Older redirects encode spaces as "+" inside the fragment.
    return description.replace(/\+/g, ' ');
  }
  return 'This link is invalid or has expired.';
}
