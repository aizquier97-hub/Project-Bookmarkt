/**
 * Socratic salon telemetry bookkeeping (D-087).
 *
 * The deck is a sequence of cards, not a transcript, so the questions the
 * owner wants answered - how far a discussion goes, how readers answer, how
 * it ends - need a small running tally per salon. This module holds that
 * tally as plain data so the screen only has to call into it from its
 * handlers and the behaviour can be tested without React.
 *
 * Privacy: counts, modes, durations and outcomes only. The reader's words
 * never enter this module - only their length.
 */

/** How the reader seeded the answer they eventually sent. */
export type SalonInputMethod = 'chip' | 'voice' | 'typed';

export type SalonStartMode = 'new' | 'resumed';

export type SalonEndReason = 'end_session' | 'wrap_up' | 'save_finish' | 'left';

export type SalonForkChoice = 'save_finish' | 'push_further';

export interface SalonTracker {
  mode: SalonStartMode;
  startedAt: number;
  answers: number;
  convergences: number;
  pushedFurther: number;
  inputMethods: Record<SalonInputMethod, number>;
  /** Method that first put words in the current draft; cleared on send/empty. */
  draftOrigin: SalonInputMethod | null;
  ended: boolean;
}

export function createSalonTracker(mode: SalonStartMode, now = Date.now()): SalonTracker {
  return {
    mode,
    startedAt: now,
    answers: 0,
    convergences: 0,
    pushedFurther: 0,
    inputMethods: { chip: 0, voice: 0, typed: 0 },
    draftOrigin: null,
    ended: false,
  };
}

/**
 * First seed wins: a chip followed by edits is still a chip answer, a
 * dictation the reader then tidies is still a voice answer.
 */
export function noteDraftOrigin(tracker: SalonTracker, origin: SalonInputMethod): void {
  if (tracker.draftOrigin === null) {
    tracker.draftOrigin = origin;
  }
}

/**
 * Called from the composer's onChangeText. Typing into an empty draft marks
 * it typed; clearing the draft forgets the origin so the next seed counts.
 */
export function noteDraftChanged(tracker: SalonTracker, chars: number): void {
  if (chars === 0) {
    tracker.draftOrigin = null;
    return;
  }
  noteDraftOrigin(tracker, 'typed');
}

export type AnswerSentSignal = {
  inputMethod: SalonInputMethod;
  /** 1-based position of this answer within the salon. */
  answerIndex: number;
  chars: number;
};

/** Records a successfully sent answer and returns its signal properties. */
export function recordAnswerSent(tracker: SalonTracker, chars: number): AnswerSentSignal {
  const inputMethod = tracker.draftOrigin ?? 'typed';
  tracker.answers += 1;
  tracker.inputMethods[inputMethod] += 1;
  tracker.draftOrigin = null;
  return { inputMethod, answerIndex: tracker.answers, chars };
}

export function recordConvergence(tracker: SalonTracker): { answers: number; convergences: number } {
  tracker.convergences += 1;
  return { answers: tracker.answers, convergences: tracker.convergences };
}

export function recordPushFurther(tracker: SalonTracker): void {
  tracker.pushedFurther += 1;
}

export type SalonEndedSignal = {
  reason: SalonEndReason;
  mode: SalonStartMode;
  answers: number;
  convergences: number;
  pushedFurther: number;
  durationSeconds: number;
  chip: number;
  voice: number;
  typed: number;
};

/**
 * Marks the salon ended and returns the summary to emit. Returns null when
 * the salon already ended, so an explicit end followed by the screen
 * unmounting produces exactly one `salon_ended`.
 */
export function endSalon(
  tracker: SalonTracker,
  reason: SalonEndReason,
  now = Date.now(),
): SalonEndedSignal | null {
  if (tracker.ended) {
    return null;
  }
  tracker.ended = true;
  return {
    reason,
    mode: tracker.mode,
    answers: tracker.answers,
    convergences: tracker.convergences,
    pushedFurther: tracker.pushedFurther,
    durationSeconds: Math.max(0, Math.round((now - tracker.startedAt) / 1000)),
    chip: tracker.inputMethods.chip,
    voice: tracker.inputMethods.voice,
    typed: tracker.inputMethods.typed,
  };
}
