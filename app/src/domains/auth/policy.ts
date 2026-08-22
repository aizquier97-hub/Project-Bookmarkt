// Mirrors the server-enforced Supabase password policy so signup fails fast
// with a readable message (Stage 2 acceptance baseline §1). Pure module so
// the policy is unit-testable without touching the Supabase client.
export function passwordPolicyError(password: string): string | null {
  if (password.length < 12) {
    return 'Password must be at least 12 characters.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include a symbol.';
  }
  return null;
}

/**
 * Translates raw Supabase auth errors into plain language (J1): the reader
 * should never see API phrasing like "Invalid login credentials". Unknown
 * errors fall back to the screen's own message.
 */
export function friendlyAuthMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : '';
  const lowered = raw.toLowerCase();
  if (lowered.includes('invalid login credentials')) {
    return "That email and password don't match. Check both and try again.";
  }
  if (lowered.includes('email not confirmed')) {
    return 'Confirm your email first - look for our message in your inbox.';
  }
  if (lowered.includes('already registered') || lowered.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (lowered.includes('rate limit') || lowered.includes('too many requests')) {
    return 'Too many attempts - wait a minute, then try again.';
  }
  if (lowered.includes('network') || lowered.includes('fetch') || lowered.includes('timed out')) {
    return 'Could not reach Bookmarkt - check your connection and try again.';
  }
  return raw || fallback;
}
