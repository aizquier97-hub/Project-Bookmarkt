/**
 * The free-versus-Book-Club comparison the Subscription screen renders as a
 * paywall (D-074). Pure data so the copy is reviewable and testable without
 * the screen. Every premium row is a companion feature gated server-side;
 * every free row is capture that stays free whatever the subscription state.
 */
export interface PaywallFeature {
  id: string;
  label: string;
  detail?: string;
  free: boolean;
  premium: boolean;
}

export const PAYWALL_FEATURES: readonly PaywallFeature[] = [
  { id: 'capture', label: 'Notes, quotes, and bookmarks', free: true, premium: true },
  { id: 'characters', label: 'Character maps', free: true, premium: true },
  { id: 'timer', label: 'Reading timer and Reading Fitness', free: true, premium: true },
  { id: 'export', label: 'Export of everything you write', free: true, premium: true },
  {
    id: 'dialogue',
    label: 'Book Club discussion',
    detail: 'Socratic conversation about your book, grounded in your own notes',
    free: false,
    premium: true,
  },
  {
    id: 'recap',
    label: 'Where you left off',
    detail: 'The story so far, retold from your notes - never past your bookmark',
    free: false,
    premium: true,
  },
  {
    id: 'recall',
    label: 'Recall match',
    detail: 'A memory game dealt from what you wrote',
    free: false,
    premium: true,
  },
  {
    id: 'search',
    label: 'Search by meaning',
    detail: 'Find a note by what it was about, not the exact words',
    free: false,
    premium: true,
  },
  {
    id: 'comprehension',
    label: 'Comprehension score',
    detail: 'How deeply your notes show you read, book by book',
    free: false,
    premium: true,
  },
  {
    id: 'capture-aid',
    label: 'Help while you capture',
    detail: 'Leading questions, arrangement help, and suggested important moments',
    free: false,
    premium: true,
  },
];
