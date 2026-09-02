import {
  companionErrorFromPayload,
  CompanionRequestError,
  mapCompanionMessageRow,
} from '@/domains/companion/api';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('companionErrorFromPayload', () => {
  it('uses the server message, code, and quota when present', () => {
    const err = companionErrorFromPayload(429, {
      error: "You've reached today's companion limit for this feature. It resets tomorrow.",
      code: 'COMPANION_DAILY_LIMIT_EXCEEDED',
      quota: { used: 50, remaining: 0, limit: 50, resetAt: '2026-09-03T00:00:00Z' },
    });
    expect(err).toBeInstanceOf(CompanionRequestError);
    expect(err.code).toBe('COMPANION_DAILY_LIMIT_EXCEEDED');
    expect(err.status).toBe(429);
    expect(err.quotaExceeded).toBe(true);
    expect(err.subscriptionRequired).toBe(false);
    expect(err.quota).toEqual({ used: 50, remaining: 0, limit: 50, resetAt: '2026-09-03T00:00:00Z' });
  });

  it('flags the subscription-offer denial', () => {
    const err = companionErrorFromPayload(402, {
      error: 'The companion is part of the paid plan.',
      code: 'COMPANION_SUBSCRIPTION_REQUIRED',
    });
    expect(err.subscriptionRequired).toBe(true);
    expect(err.quotaExceeded).toBe(false);
  });

  it('falls back to friendly copy when the body is unreadable', () => {
    const err = companionErrorFromPayload(402, null);
    expect(err.message).toBe('The companion is part of the paid plan.');
    expect(err.code).toBe('HTTP_402');
    const unknown = companionErrorFromPayload(500, 'not-json');
    expect(unknown.message).toBe('The companion could not respond. Please try again.');
  });
});

describe('mapCompanionMessageRow', () => {
  it('normalizes a companion row with provenance metadata', () => {
    expect(
      mapCompanionMessageRow({
        id: 7,
        role: 'companion',
        feature: 'dialogue',
        content: 'Your notes place Kvothe at the university.',
        provenance: {
          sources: 'your_notes',
          declined: false,
          boundaryLabel: 'page 120',
          entryCount: 4,
        },
        created_at: '2026-09-02T12:00:00Z',
      }),
    ).toEqual({
      id: 7,
      role: 'companion',
      feature: 'dialogue',
      content: 'Your notes place Kvothe at the university.',
      createdAt: '2026-09-02T12:00:00Z',
      provenance: 'your_notes',
      declined: false,
      boundaryLabel: 'page 120',
    });
  });

  it('treats reader rows and malformed provenance as unlabeled', () => {
    const reader = mapCompanionMessageRow({
      id: 1,
      role: 'reader',
      feature: 'dialogue',
      content: 'Who is Denna?',
      provenance: null,
      created_at: '2026-09-02T11:59:00Z',
    });
    expect(reader.role).toBe('reader');
    expect(reader.provenance).toBeNull();
    expect(reader.declined).toBe(false);

    const malformed = mapCompanionMessageRow({
      id: 2,
      role: 'companion',
      feature: 'dialogue',
      content: 'x',
      provenance: ['not', 'an', 'object'],
      created_at: '2026-09-02T12:01:00Z',
    });
    expect(malformed.provenance).toBeNull();
    expect(malformed.boundaryLabel).toBeNull();
  });

  it('marks declined replies', () => {
    const declined = mapCompanionMessageRow({
      id: 3,
      role: 'companion',
      feature: 'dialogue',
      content: 'That lies beyond your latest entry; I shall not spoil it.',
      provenance: { sources: 'your_notes', declined: true, boundaryLabel: null },
      created_at: '2026-09-02T12:02:00Z',
    });
    expect(declined.declined).toBe(true);
  });
});
