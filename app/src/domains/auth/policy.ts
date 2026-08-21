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
