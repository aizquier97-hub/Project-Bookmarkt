import { isLikelyNetworkError } from '../networkErrors';

describe('isLikelyNetworkError', () => {
  it.each([
    'Network request failed',
    'TypeError: Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'The request timed out',
    'connect ECONNREFUSED 127.0.0.1:443',
    'Unable to resolve host "bfallxtcxxyykcnkedom.supabase.co"',
    'No internet connection',
    'Connection reset by peer',
    'fetch failed',
  ])('detects "%s" as a network error', (message) => {
    expect(isLikelyNetworkError(new Error(message))).toBe(true);
    expect(isLikelyNetworkError(message)).toBe(true);
  });

  it.each([
    'Invalid login credentials',
    'JWT expired',
    'duplicate key value violates unique constraint',
    'Row level security policy violation',
    '',
  ])('does not flag "%s"', (message) => {
    expect(isLikelyNetworkError(new Error(message))).toBe(false);
  });

  it('handles non-error values', () => {
    expect(isLikelyNetworkError(null)).toBe(false);
    expect(isLikelyNetworkError(undefined)).toBe(false);
    expect(isLikelyNetworkError(42)).toBe(false);
    expect(isLikelyNetworkError({})).toBe(false);
  });
});
