import { useRouter } from 'expo-router';

import { PickABookTab } from '@/components/PickABookTab';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';

/**
 * The Recall tab (D-066, restyled D-094 after the Figma "Recall · Free /
 * Premium" screens): a timed memory-match game dealt only from the reader's
 * own entries and character maps. Book first, board second - each board
 * covers one book. The game itself lives on the match screen, which also
 * carries the subscription offer for free readers.
 */
export default function RecallTab() {
  const router = useRouter();
  return (
    <PickABookTab
      copy={{
        tagline: 'Remember what you read.',
        freeLede: 'Improve your memory using your own notes.',
        memberLede: 'Turn two tiles. Match cue to answer against the clock.',
        groundingNote: 'Made only from your own entries.',
        lockCardTitle: 'Recall with Book Club',
        lockedLabel: 'Recall locked',
        memberFooter: 'Choose one book for your memory game.',
        emptyMessage: 'Add a book to your library first - each Recall board covers one book.',
      }}
      paywallSource="match_lock"
      onPickBook={(book, context) => {
        // Recall funnel (D-087): same shape as the club pick so the two
        // premium doors can be compared side by side.
        trackAnalyticsEvent(
          'recall_book_picked',
          {
            shelfIndex: context.index,
            shelfSize: context.shelfSize,
            hasEntries: context.hasEntries,
            finished: Boolean(book.finished_at),
          },
          book.id,
        );
        router.push({ pathname: '/match', params: { id: String(book.id) } });
      }}
    />
  );
}
