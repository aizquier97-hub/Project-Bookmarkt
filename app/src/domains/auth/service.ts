import { supabase } from '@/lib/supabase';

// Mirrors the server-enforced Supabase password policy so signup fails fast
// with a readable message (Stage 2 acceptance baseline §1).
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

// Other domains obtain the acting user through the auth domain
// (STAGE_2_ARCHITECTURE.md §2: cross-domain access goes through the owner).
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('You must be signed in.');
  }
  return data.user.id;
}
