import {
  createSalonTracker,
  endSalon,
  noteDraftChanged,
  noteDraftOrigin,
  recordAnswerSent,
  recordConvergence,
  recordPushFurther,
} from '../salonSignals';

describe('salonSignals (D-087)', () => {
  it('starts a clean tally for a new salon', () => {
    const tracker = createSalonTracker('new', 1_000);
    expect(tracker).toEqual({
      mode: 'new',
      startedAt: 1_000,
      answers: 0,
      convergences: 0,
      pushedFurther: 0,
      inputMethods: { chip: 0, voice: 0, typed: 0 },
      draftOrigin: null,
      ended: false,
    });
  });

  describe('draft origin', () => {
    it('keeps the first seed when the reader edits a chip answer', () => {
      const tracker = createSalonTracker('new');
      noteDraftOrigin(tracker, 'chip');
      noteDraftChanged(tracker, 24);
      noteDraftOrigin(tracker, 'voice');
      expect(tracker.draftOrigin).toBe('chip');
    });

    it('marks typing into an empty draft as typed', () => {
      const tracker = createSalonTracker('new');
      noteDraftChanged(tracker, 1);
      expect(tracker.draftOrigin).toBe('typed');
    });

    it('forgets the origin when the draft is cleared so the next seed counts', () => {
      const tracker = createSalonTracker('new');
      noteDraftOrigin(tracker, 'chip');
      noteDraftChanged(tracker, 0);
      expect(tracker.draftOrigin).toBeNull();
      noteDraftOrigin(tracker, 'voice');
      expect(tracker.draftOrigin).toBe('voice');
    });
  });

  describe('recordAnswerSent', () => {
    it('numbers answers, attributes the method, and resets the draft origin', () => {
      const tracker = createSalonTracker('new');
      noteDraftOrigin(tracker, 'voice');
      expect(recordAnswerSent(tracker, 80)).toEqual({
        inputMethod: 'voice',
        answerIndex: 1,
        chars: 80,
      });
      expect(tracker.draftOrigin).toBeNull();

      expect(recordAnswerSent(tracker, 12)).toEqual({
        inputMethod: 'typed',
        answerIndex: 2,
        chars: 12,
      });
      expect(tracker.answers).toBe(2);
      expect(tracker.inputMethods).toEqual({ chip: 0, voice: 1, typed: 1 });
    });

    it('never carries the words, only their length', () => {
      const tracker = createSalonTracker('new');
      const signal = recordAnswerSent(tracker, 5);
      expect(Object.keys(signal).sort()).toEqual(['answerIndex', 'chars', 'inputMethod']);
    });
  });

  it('counts convergences and push-further loops', () => {
    const tracker = createSalonTracker('resumed');
    recordAnswerSent(tracker, 10);
    expect(recordConvergence(tracker)).toEqual({ answers: 1, convergences: 1 });
    recordPushFurther(tracker);
    recordAnswerSent(tracker, 10);
    expect(recordConvergence(tracker)).toEqual({ answers: 2, convergences: 2 });
    expect(tracker.pushedFurther).toBe(1);
  });

  describe('endSalon', () => {
    it('summarises the salon with a rounded duration', () => {
      const tracker = createSalonTracker('new', 10_000);
      noteDraftOrigin(tracker, 'chip');
      recordAnswerSent(tracker, 30);
      noteDraftOrigin(tracker, 'voice');
      recordAnswerSent(tracker, 60);
      recordConvergence(tracker);
      expect(endSalon(tracker, 'save_finish', 10_000 + 95_400)).toEqual({
        reason: 'save_finish',
        mode: 'new',
        answers: 2,
        convergences: 1,
        pushedFurther: 0,
        durationSeconds: 95,
        chip: 1,
        voice: 1,
        typed: 0,
      });
    });

    it('emits once: an explicit end followed by leaving the screen is a single event', () => {
      const tracker = createSalonTracker('new');
      expect(endSalon(tracker, 'end_session')).not.toBeNull();
      expect(endSalon(tracker, 'left')).toBeNull();
      expect(tracker.ended).toBe(true);
    });

    it('reports zero answers for a salon the reader left at the first card', () => {
      const tracker = createSalonTracker('new', 5_000);
      expect(endSalon(tracker, 'left', 5_000)).toMatchObject({
        reason: 'left',
        answers: 0,
        durationSeconds: 0,
      });
    });

    it('never reports a negative duration if the clock moves backwards', () => {
      const tracker = createSalonTracker('new', 5_000);
      expect(endSalon(tracker, 'left', 1_000)?.durationSeconds).toBe(0);
    });
  });
});
