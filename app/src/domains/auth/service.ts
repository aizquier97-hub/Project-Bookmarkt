import { passwordPolicyError } from '@/domains/auth/policy';
import { supabase } from '@/lib/supabase';

export { passwordPolicyError };

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email: email.trim(), password });
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
  const params = parseUrlParams(url);
  const errorDescription = params.get('error_description');
  if (errorDescription) {
    throw new Error(errorDescription.replace(/\+/g, ' '));
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return false;
  }
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
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

function parseUrlParams(url: string): URLSearchParams {
  // Tokens may arrive in the fragment (implicit flow) or the query string.
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
