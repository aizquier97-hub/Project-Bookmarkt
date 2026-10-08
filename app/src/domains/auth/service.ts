import { parseAuthLink, parseUrlParams } from '@/domains/auth/authLink';
import { passwordPolicyError } from '@/domains/auth/policy';
import { supabase } from '@/lib/supabase';

export { passwordPolicyError };

/**
 * Creates the account. `emailRedirectTo` is where the emailed confirmation
 * link lands; without it Supabase falls back to the project Site URL (the
 * frozen prototype PWA), so the app always passes its own deep link.
 */
export async function signUp(
  email: string,
  password: string,
  emailRedirectTo?: string,
): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) {
    throw error;
  }
}

/**
 * Sends the confirmation email again for an unconfirmed account. Supabase
 * enforces one email per address per minute; the caller shows a cooldown.
 */
export async function resendSignUpEmail(email: string, emailRedirectTo: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo },
  });
  if (error) {
    throw error;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/** Sends a recovery link that deep-links back into the app's reset screen. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error('Enter your account email first.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
  if (error) {
    throw error;
  }
}

/**
 * Establishes the recovery session from the deep-link URL Supabase redirects
 * to after the emailed link is verified (implicit flow: tokens in fragment).
 */
export async function createSessionFromRecoveryUrl(url: string): Promise<boolean> {
  const link = parseAuthLink(url);
  if (link.kind === 'error') {
    throw new Error(link.message);
  }
  if (link.kind === 'none') {
    return false;
  }
  const { error } = await supabase.auth.setSession({
    access_token: link.accessToken,
    refresh_token: link.refreshToken,
  });
  if (error) {
    throw error;
  }
  return true;
}

/** True when the URL looks like a Supabase recovery redirect at all. */
export function isRecoveryUrl(url: string): boolean {
  const params = parseUrlParams(url);
  return (
    params.get('type') === 'recovery' ||
    Boolean(params.get('access_token')) ||
    Boolean(params.get('error_description'))
  );
}

/** True when the redirect URL carries the tokens needed to establish a session. */
export function hasSessionTokens(url: string): boolean {
  return parseAuthLink(url).kind === 'tokens';
}

/** Sets a new password for the signed-in (recovery) session. */
export async function updatePassword(newPassword: string): Promise<void> {
  const policyError = passwordPolicyError(newPassword);
  if (policyError) {
    throw new Error(policyError);
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw error;
  }
}

// Other domains obtain the acting user through the auth domain
// (STAGE_2_ARCHITECTURE.md §2: cross-domain access goes through the owner).
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('You must be signed in.');
  }
  return data.user.id;
}
