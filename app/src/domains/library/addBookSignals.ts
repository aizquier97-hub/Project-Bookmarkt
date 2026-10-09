/**
 * Add-book funnel classifiers (D-086). Pure, so the reasons readers leave
 * the search-first flow for the manual form can be tested without the
 * screen. Counts and flags only - the query itself never leaves the device.
 */

export type ManualAddReason =
  | 'direct'
  | 'zero_results'
  | 'results_rejected'
  | 'search_error'
  | 'scan_miss';

export function manualAddReason(input: {
  searchError: boolean;
  queryLength: number;
  minQueryLength: number;
  resultCount: number;
  searching: boolean;
}): ManualAddReason {
  if (input.searchError) {
    return 'search_error';
  }
  if (input.queryLength < input.minQueryLength) {
    return 'direct';
  }
  if (input.searching) {
    return 'direct';
  }
  return input.resultCount === 0 ? 'zero_results' : 'results_rejected';
}

export type BookSearchStatus = 'results' | 'zero_results' | 'error';

export function bookSearchStatus(resultCount: number): BookSearchStatus {
  return resultCount > 0 ? 'results' : 'zero_results';
}
