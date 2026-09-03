import type { CompanionChatMessage } from '../api';
import { buildSalons } from '../salons';

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
});
