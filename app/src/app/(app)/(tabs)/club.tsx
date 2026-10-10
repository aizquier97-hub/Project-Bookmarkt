import { useRouter } from 'expo-router';

import { PickABookTab } from '@/components/PickABookTab';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';

/**
 * The Book Club tab (Interface v2.0, restyled D-094 after the Figma "Book
 * Club · Free / Premium" screens): the companion's socratic dialogue as its
 * own home destination. A book is chosen first, since the conversation is
 * grounded in that book's records alone; the chat itself lives on the
 * companion screen, which also carries the subscription offer for free
 * readers.
 */
export default function BookClubTab() {
  const router = useRouter();
  return (
    <PickABookTab
      copy={{
        tagline: 'A book club of two.',
        freeLede: 'Talk one-to-one with your personalized companion.',
        memberLede: 'Talk one-to-one with a companion, using only your notes.',
        groundingNote: 'Never past your latest recorded page.',
        lockCardTitle: 'Reading companion',
        lockedLabel: 'Discussion locked',
        memberFooter: 'Choose one book to talk about.',
        emptyMessage: 'Add a book to your library first - the Book Club talks about one book at a time.',
      }}
      paywallSource="club_lock"
      onPickBook={(book, context) => {
        // Club funnel (D-087): which shelf position gets picked and whether
        // that book has notes to talk about - before the companion's own
        // gate decides what the reader sees.
        trackAnalyticsEvent(
          'club_book_picked',
          {
            shelfIndex: context.index,
            shelfSize: context.shelfSize,
            hasEntries: context.hasEntries,
            finished: Boolean(book.finished_at),
          },
          book.id,
        );
        router.push({ pathname: '/companion', params: { id: String(book.id) } });
      }}
    />
  );
}
