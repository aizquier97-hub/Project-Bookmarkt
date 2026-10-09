import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/**
 * The first-run welcome tour (D-084): one card for what Bookmarkt is, one
 * per tab in tab-bar order, and one for the Book Club plan. Pure data so the
 * copy is reviewable and testable without rendering the carousel. The
 * premium card is the only one that sells anything, and it sells on reading
 * performance - remembering, understanding, and finishing - not on features
 * for their own sake. Prices are deliberately absent: the Subscription
 * screen reads them from the store (D-070), and they change (D-081).
 */
export type OnboardingIcon = ComponentProps<typeof Ionicons>['name'];

export interface OnboardingSlide {
  id: string;
  /** Small-caps label above the title, e.g. the tab the card describes. */
  eyebrow: string;
  title: string;
  body: string;
  /** Short, scannable rows under the body. */
  points: readonly string[];
  icon: OnboardingIcon;
  /** The one card about the paid plan; rendered with the gold lock treatment. */
  premium?: boolean;
}

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 'welcome',
    eyebrow: 'Welcome to Bookmarkt',
    title: 'Your reading, in your own words.',
    body: 'A reading journal for paper books. Scan a book, write a sentence or two each time you sit down, and watch what you read turn into something you keep.',
    points: [
      'One sentence per sitting is plenty.',
      'Everything you write is yours - never AI-written.',
      'Notes, quotes, maps, and the timer are free forever.',
    ],
    icon: 'book-outline',
  },
  {
    id: 'profile',
    eyebrow: 'Profile tab',
    title: 'Reading Fitness, like a training log.',
    body: 'Your home screen. Every number comes from the sittings you time and the entries you log, so it measures real reading, not screen time.',
    points: [
      'Streaks, pace, endurance, and consistency.',
      'The Sandglass timer rings a bell when your sitting is done - even with the screen off.',
      'Trophies shelved by how hard the book was.',
    ],
    icon: 'person-circle-outline',
  },
  {
    id: 'library',
    eyebrow: 'Library tab',
    title: 'Your shelf, cover first.',
    body: 'Scan the barcode to add a book. Open one to log notes, quotes, and bookmarks, keep a character map, and pick up where you left off.',
    points: [
      'Continue Reading sits at the top of the shelf.',
      'Each book keeps a timeline of what you wrote.',
      'Character maps grow as the cast grows.',
    ],
    icon: 'library-outline',
  },
  {
    id: 'quotes',
    eyebrow: 'Quotes tab',
    title: 'The lines worth keeping.',
    body: 'Every quote you log, from every book, on one shelf. Heart the ones that matter and write a few words about why.',
    points: [
      'Reflections count toward your comprehension score.',
      'Thinking about a passage is reading too.',
    ],
    icon: 'chatbox-ellipses-outline',
  },
  {
    id: 'club',
    eyebrow: 'Book Club and Recall tabs',
    title: 'Read deeper. Remember more.',
    body: 'The Book Club plan adds a companion that works only from your own notes and never reads past your bookmark - so it strengthens your reading instead of replacing it.',
    points: [
      'Book Club: Socratic discussion that sharpens understanding.',
      'Where you left off: the story so far, retold from your notes.',
      'Recall: a memory game dealt from what you wrote.',
      'Search by meaning and a comprehension score, book by book.',
    ],
    icon: 'people-outline',
    premium: true,
  },
  {
    id: 'settings',
    eyebrow: 'Settings tab',
    title: 'Your account, your data.',
    body: 'Link QR bookmarks, export everything you have written as JSON, manage your plan, or report an issue. You can replay this tour from here any time.',
    points: ['QR bookmarks jump straight to a book.', 'Export or delete your data whenever you like.'],
    icon: 'settings-outline',
  },
];
