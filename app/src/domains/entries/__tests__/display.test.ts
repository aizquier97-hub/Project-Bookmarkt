import {
  buildBookmarkLabel,
  entrySummaryIsStale,
  formatBookmarkCaption,
  formatBoundaryPosition,
  getCurrentPosition,
  splitEntryText,
  splitTextForHighlight,
  summarizeEntriesByBook,
} from '@/domains/entries/display';

/** Mirror of the shared djb2 contract (client display.ts / companion Edge Function). */
function djb2(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `djb2:${(hash >>> 0).toString(16)}:${text.length}`;
}

describe('buildBookmarkLabel', () => {
  it('prefers the cached companion summary', () => {
    expect(buildBookmarkLabel({ text: 'A long note', ai_summary: ' Raskolnikov confesses. ' })).toEqual({
      text: 'Raskolnikov confesses.',
      fromCompanion: true,
    });
  });

  it('falls back to the entry text, collapsing whitespace', () => {
    expect(buildBookmarkLabel({ text: 'Short  note\nwith lines', ai_summary: null })).toEqual({
      text: 'Short note with lines',
      fromCompanion: false,
    });
  });

  it('strips the boundary header before excerpting', () => {
    expect(buildBookmarkLabel({ text: '[Manual Entry - page 187]\nThe trial begins.' })).toEqual({
      text: 'The trial begins.',
      fromCompanion: false,
    });
  });

  it('truncates long excerpts at a word boundary with an ellipsis', () => {
    const label = buildBookmarkLabel({ text: 'word '.repeat(60).trim() }, 24);
    expect(label.text.endsWith('…')).toBe(true);
    expect(label.text.length).toBeLessThanOrEqual(25);
    expect(label.text).toBe('word word word word…');
  });
});

describe('formatBookmarkCaption', () => {
  it('joins the boundary label and the written day', () => {
    const caption = formatBookmarkCaption({
      text: '[Manual Entry - page 187]\nBody',
      created_at: '2026-08-20T15:00:00.000Z',
    });
    expect(caption.startsWith('Page 187, ')).toBe(true);
    expect(caption).toMatch(/Aug/);
  });

  it('omits missing parts', () => {
    expect(formatBookmarkCaption({ text: 'No header', created_at: null })).toBe('');
    const dayOnly = formatBookmarkCaption({ text: 'No header', created_at: '2026-08-20T15:00:00.000Z' });
    expect(dayOnly).not.toContain(',  ');
    expect(dayOnly).toMatch(/Aug/);
    expect(formatBookmarkCaption({ text: '[Manual Entry - chapter 7]\nBody', created_at: 'bogus' })).toBe(
      'Chapter 7',
    );
  });
});

describe('entrySummaryIsStale', () => {
  it('is false for empty entries', () => {
    expect(entrySummaryIsStale({ text: null })).toBe(false);
    expect(entrySummaryIsStale({ text: '   ' })).toBe(false);
  });

  it('is true when no summary is cached yet', () => {
    expect(entrySummaryIsStale({ text: 'Some note', ai_summary: null, ai_summary_hash: null })).toBe(true);
  });

  it('is false when the cached hash matches the current text', () => {
    const text = '[Manual Entry - page 12]\nSome note';
    expect(
      entrySummaryIsStale({ text, ai_summary: 'A summary.', ai_summary_hash: djb2(text) }),
    ).toBe(false);
  });

  it('is true after the text is edited', () => {
    expect(
      entrySummaryIsStale({
        text: 'Edited note',
        ai_summary: 'A summary.',
        ai_summary_hash: djb2('Original note'),
      }),
    ).toBe(true);
  });
});

describe('splitTextForHighlight', () => {
  it('marks every case-insensitive match', () => {
    expect(splitTextForHighlight('The Monk met a monk.', 'monk')).toEqual([
      { text: 'The ', match: false },
      { text: 'Monk', match: true },
      { text: ' met a ', match: false },
      { text: 'monk', match: true },
      { text: '.', match: false },
    ]);
  });

  it('handles matches at the start and end', () => {
    expect(splitTextForHighlight('monk to monk', 'monk')).toEqual([
      { text: 'monk', match: true },
      { text: ' to ', match: false },
      { text: 'monk', match: true },
    ]);
  });

  it('returns one plain segment when the query is empty or has no hits', () => {
    expect(splitTextForHighlight('Some text', '')).toEqual([{ text: 'Some text', match: false }]);
    expect(splitTextForHighlight('Some text', '  ')).toEqual([{ text: 'Some text', match: false }]);
    expect(splitTextForHighlight('Some text', 'zebra')).toEqual([
      { text: 'Some text', match: false },
    ]);
  });

  it('treats regex special characters as plain text', () => {
    expect(splitTextForHighlight('cost (a+b) dollars', '(a+b)')).toEqual([
      { text: 'cost ', match: false },
      { text: '(a+b)', match: true },
      { text: ' dollars', match: false },
    ]);
  });
});

describe('splitEntryText', () => {
  it('splits the machine header from the body', () => {
    expect(splitEntryText('[Manual Entry - page 12-15]\nKip reaches the tower.')).toEqual({
      boundaryLabel: 'Page 12-15',
      body: 'Kip reaches the tower.',
    });
  });

  it('handles single-value chapter headers', () => {
    expect(splitEntryText('[Manual Entry - chapter 3]\nThe duel begins.')).toEqual({
      boundaryLabel: 'Chapter 3',
      body: 'The duel begins.',
    });
  });

  it('keeps multi-line bodies intact', () => {
    const parts = splitEntryText('[Manual Entry - page 40]\nLine one.\nLine two.');
    expect(parts.body).toBe('Line one.\nLine two.');
  });

  it('passes through text without a header', () => {
    expect(splitEntryText('Just a thought about the plot.')).toEqual({
      boundaryLabel: null,
      body: 'Just a thought about the plot.',
    });
  });

  it('does not treat a mid-text bracket line as a header', () => {
    const parts = splitEntryText('First line\n[Manual Entry - page 2]\nrest');
    expect(parts.boundaryLabel).toBeNull();
  });

  it('handles null, undefined, and header-only text', () => {
    expect(splitEntryText(null)).toEqual({ boundaryLabel: null, body: '' });
    expect(splitEntryText(undefined)).toEqual({ boundaryLabel: null, body: '' });
    expect(splitEntryText('[Manual Entry - page 5]')).toEqual({
      boundaryLabel: 'Page 5',
      body: '',
    });
  });
});

describe('formatBoundaryPosition', () => {
  it('formats page and chapter positions', () => {
    expect(formatBoundaryPosition({ progressType: 'page', lower: 12, upper: 15 })).toBe(
      'Page 15',
    );
    expect(formatBoundaryPosition({ progressType: 'chapter', lower: null, upper: 7 })).toBe(
      'Chapter 7',
    );
  });
});

describe('getCurrentPosition', () => {
  it('returns the newest parseable boundary regardless of progress type', () => {
    const entries = [
      { text: 'edited away the header' },
      { text: '[Manual Entry - chapter 7]\nlatest chapter' },
      { text: '[Manual Entry - page 90]\nolder page entry' },
    ];
    expect(getCurrentPosition(entries)).toEqual({
      progressType: 'chapter',
      lower: null,
      upper: 7,
    });
  });

  it('returns null when nothing parses', () => {
    expect(getCurrentPosition([{ text: 'no header' }, { text: null }])).toBeNull();
  });
});

describe('summarizeEntriesByBook', () => {
  it('keeps the newest timestamp and newest parseable position per book', () => {
    const rows = [
      { topic_id: 1, text: 'no header here', created_at: '2026-08-20T10:00:00Z' },
      {
        topic_id: 2,
        text: '[Manual Entry - chapter 4]\nlatest for book two',
        created_at: '2026-08-19T09:00:00Z',
      },
      {
        topic_id: 1,
        text: '[Manual Entry - page 90]\nolder for book one',
        created_at: '2026-08-15T08:00:00Z',
      },
      {
        topic_id: 1,
        text: '[Manual Entry - page 12]\noldest for book one',
        created_at: '2026-08-01T08:00:00Z',
      },
    ];
    const summaries = summarizeEntriesByBook(rows);
    expect(summaries.get(1)).toEqual({
      lastEntryAt: '2026-08-20T10:00:00Z',
      position: { progressType: 'page', lower: null, upper: 90 },
    });
    expect(summaries.get(2)).toEqual({
      lastEntryAt: '2026-08-19T09:00:00Z',
      position: { progressType: 'chapter', lower: null, upper: 4 },
    });
  });

  it('skips rows without a book id and allows books with no position', () => {
    const summaries = summarizeEntriesByBook([
      {
        topic_id: null,
        text: '[Manual Entry - page 5]\norphan row',
        created_at: '2026-08-20T10:00:00Z',
      },
      { topic_id: 3, text: 'plain thought, no header', created_at: '2026-08-18T10:00:00Z' },
    ]);
    expect(summaries.size).toBe(1);
    expect(summaries.get(3)).toEqual({
      lastEntryAt: '2026-08-18T10:00:00Z',
      position: null,
    });
  });

  it('returns an empty map for no rows', () => {
    expect(summarizeEntriesByBook([]).size).toBe(0);
  });
});
