// Validated build-time configuration (STAGE_2_ARCHITECTURE.md §5).
// A build refuses to run with missing or malformed configuration.

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy app/.env.example to app/.env and fill in the values, then restart the dev server.',
    );
  }
  return value.trim();
}

const supabaseUrl = requireEnv('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);

if (!supabaseUrl.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL must be an https:// URL.');
}

export const env = {
  supabaseUrl,
  supabaseAnonKey: requireEnv(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
