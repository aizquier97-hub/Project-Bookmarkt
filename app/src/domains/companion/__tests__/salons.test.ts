import type { CompanionChatMessage } from '../api';
import { abandonedSalons, buildSalons, completedSalons, replayCards } from '../salons';

const SALON_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SALON_B = 'bbbbbbbb-2222-4222-8222-222222222222';

let nextId = 1;
function msg(
  overrides: Partial<CompanionChatMessage> & Pick<CompanionChatMessage, 'role' | 'content'>,
): CompanionChatMessage {
  const id = nextId++;
  return {
    id,
    feature: 'dialogue',
    createdAt: `2026-09-05T09:${String(id).padStart(2, '0')}:00Z`,
    salonId: SALON_A,
    provenance: null,
    declined: false,
    boundaryLabel: null,
    ...overrides,
  };
}

describe('buildSalons', () => {
  beforeEach(() => {
    nextId = 1;
  });

  it('groups messages into Q/A pairs with the takeaway split out', () => {
    const salons = buildSalons([
      msg({ role: 'companion', feature: 'observation', content: 'What changed in Alyosha?' }),
      msg({ role: 'reader', content: 'It shatters his naivety because he trusted his father.' }),
      msg({ role: 'companion', content: 'If shattered, why does he stay?' }),
      msg({ role: 'companion', feature: 'insight', content: 'You argued his faith bends without breaking.' }),
    ]);
    expect(salons).toHaveLength(1);
    expect(salons[0].pairs).toEqual([
      {
        question: 'What changed in Alyosha?',
        answer: 'It shatters his naivety because he trusted his father.',
      },
      { question: 'If shattered, why does he stay?', answer: null },
    ]);
    expect(salons[0].insight).toBe('You argued his faith bends without breaking.');
    expect(salons[0].lastProbe).toBe('If shattered, why does he stay?');
  });

  it('sorts salons newest first and drops legacy rows without a salon', () => {
    const salons = buildSalons([
      msg({ role: 'companion', content: 'Older probe.', salonId: SALON_A }),
      msg({ role: 'reader', content: 'Legacy chat message.', salonId: null }),
      msg({ role: 'companion', feature: 'quiz', content: 'A quiz, not a salon.', salonId: SALON_B }),
      msg({ role: 'companion', content: 'Newer probe.', salonId: SALON_B }),
    ]);
    expect(salons.map((s) => s.id)).toEqual([SALON_B, SALON_A]);
    expect(salons[1].pairs).toEqual([{ question: 'Older probe.', answer: null }]);
    expect(salons[0].pairs).toEqual([{ question: 'Newer probe.', answer: null }]);
  });

  it('pairs an unprompted reader answer with a null question', () => {
    const salons = buildSalons([msg({ role: 'reader', content: 'A thought on my own.' })]);
    expect(salons[0].pairs).toEqual([{ question: null, answer: 'A thought on my own.' }]);
    expect(salons[0].lastProbe).toBeNull();
    expect(salons[0].insight).toBeNull();
  });

  it('keeps the latest insight when a completed salon is continued', () => {
    // Continuing (D-098) re-opens the salon on its takeaway: the deck
    // persists that text as a new opener, so the reaction pairs with it.
    const salons = buildSalons([
      msg({ role: 'companion', feature: 'observation', content: 'Opener?' }),
      msg({ role: 'reader', content: 'First answer.' }),
      msg({ role: 'companion', content: 'Synthesis, never answered.' }),
      msg({ role: 'companion', feature: 'insight', content: 'First takeaway.' }),
      msg({ role: 'companion', feature: 'observation', content: 'First takeaway.' }),
      msg({ role: 'reader', content: 'A later reaction.' }),
      msg({ role: 'companion', content: 'A new probe?' }),
      msg({ role: 'companion', feature: 'insight', content: 'Second takeaway.' }),
    ]);
    expect(salons[0].insight).toBe('Second takeaway.');
    expect(salons[0].pairs).toEqual([
      { question: 'Opener?', answer: 'First answer.' },
      { question: 'Synthesis, never answered.', answer: null },
      { question: 'First takeaway.', answer: 'A later reaction.' },
      { question: 'A new probe?', answer: null },
    ]);
    expect(replayCards(salons[0])).toEqual([
      { question: 'Opener?', answer: 'First answer.' },
      { question: 'First takeaway.', answer: 'A later reaction.' },
    ]);
  });
});

describe('completed and abandoned salons (D-098)', () => {
  beforeEach(() => {
    nextId = 1;
  });

  it('splits salons by whether an insight was stored', () => {
    const salons = buildSalons([
      msg({ role: 'companion', feature: 'observation', content: 'Nobody answered this.', salonId: SALON_A }),
      msg({ role: 'companion', feature: 'observation', content: 'Finished opener.', salonId: SALON_B }),
      msg({ role: 'reader', content: 'An answer.', salonId: SALON_B }),
      msg({ role: 'companion', feature: 'insight', content: 'The takeaway.', salonId: SALON_B }),
    ]);
    expect(completedSalons(salons).map((s) => s.id)).toEqual([SALON_B]);
    expect(abandonedSalons(salons).map((s) => s.id)).toEqual([SALON_A]);
  });

  it('treats a salon with answers but no insight as abandoned', () => {
    const salons = buildSalons([
      msg({ role: 'companion', feature: 'observation', content: 'Opener?' }),
      msg({ role: 'reader', content: 'Answered, then left.' }),
      msg({ role: 'companion', content: 'Follow-up?' }),
    ]);
    expect(completedSalons(salons)).toEqual([]);
    expect(abandonedSalons(salons)).toHaveLength(1);
  });
});

describe('replayCards', () => {
  beforeEach(() => {
    nextId = 1;
  });

  it('keeps only answered questions, dropping the trailing unanswered probe', () => {
    const [salon] = buildSalons([
      msg({ role: 'companion', feature: 'observation', content: 'Q1?' }),
      msg({ role: 'reader', content: 'A1.' }),
      msg({ role: 'companion', content: 'Q2?' }),
      msg({ role: 'reader', content: 'A2.' }),
      msg({ role: 'companion', content: 'Synthesis probe, never answered.' }),
      msg({ role: 'companion', feature: 'insight', content: 'Insight.' }),
    ]);
    expect(replayCards(salon)).toEqual([
      { question: 'Q1?', answer: 'A1.' },
      { question: 'Q2?', answer: 'A2.' },
    ]);
  });

  it('keeps an unprompted answer as a card with no question', () => {
    const [salon] = buildSalons([msg({ role: 'reader', content: 'On my own.' })]);
    expect(replayCards(salon)).toEqual([{ question: null, answer: 'On my own.' }]);
  });
});
