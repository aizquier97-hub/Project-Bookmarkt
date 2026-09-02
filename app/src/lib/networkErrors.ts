/**
 * Best-effort detection of connectivity failures (Stage 3 offline pass).
 * Supabase and fetch surface network drops as opaque TypeErrors; matching
 * the well-known message shapes lets error states say "check your
 * connection" instead of leaking "Network request failed" verbatim.
 */
const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /networkerror/i,
  /timed?\s?out/i,
  /econnrefused/i,
  /econnreset/i,
  /socket/i,
  /unable to resolve host/i,
  /no internet/i,
  /internet connection/i,
  /connection (refused|reset|closed|lost)/i,
  /fetch failed/i,
];

export function isLikelyNetworkError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
