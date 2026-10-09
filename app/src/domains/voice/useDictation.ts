import { useCallback, useEffect, useRef, useState } from 'react';

import {
  dictationStartOptions,
  getSpeechModule,
  isDictationAvailable,
  type SpeechErrorEvent,
  type SpeechResultEvent,
  type SpeechSubscription,
} from '@/domains/voice/recognition';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';

export type DictationStatus = 'unavailable' | 'idle' | 'recording' | 'review';

/**
 * Dictation state machine (D-016): idle → recording (live partials) →
 * review (verbatim raw transcript awaiting reader confirmation) → idle.
 * The caller reads `raw` in the review state and must let the reader confirm
 * or discard before any text is stored.
 *
 * Usage signals (D-086) report the lifecycle only - started, how a take
 * ended, and whether the review was kept - never the words themselves.
 */
export function useDictation() {
  const [status, setStatus] = useState<DictationStatus>(() =>
    isDictationAvailable() ? 'idle' : 'unavailable',
  );
  const [partial, setPartial] = useState('');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const committedRef = useRef<string[]>([]);
  const interimRef = useRef('');
  const subsRef = useRef<SpeechSubscription[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const erroredRef = useRef(false);

  const clearSubs = useCallback(() => {
    subsRef.current.forEach((sub) => sub.remove());
    subsRef.current = [];
  }, []);

  const finishTake = useCallback((outcome: 'review' | 'empty' | 'error', chars: number) => {
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    trackAnalyticsEvent('dictation_finished', {
      outcome,
      durationSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
      chars,
    });
  }, []);

  useEffect(
    () => () => {
      clearSubs();
      try {
        getSpeechModule()?.abort();
      } catch {
        // Recognizer already stopped.
      }
    },
    [clearSubs],
  );

  const start = useCallback(async () => {
    const speech = getSpeechModule();
    if (!speech) {
      setStatus('unavailable');
      return;
    }
    setError(null);
    trackAnalyticsEvent('dictation_started', {});
    try {
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        trackAnalyticsEvent('dictation_finished', {
          outcome: 'permission_denied',
          durationSeconds: 0,
          chars: 0,
        });
        setError('Microphone permission is required for dictation.');
        return;
      }
      committedRef.current = [];
      interimRef.current = '';
      erroredRef.current = false;
      setPartial('');
      setRaw('');
      clearSubs();
      subsRef.current.push(
        speech.addListener('result', (event: SpeechResultEvent) => {
          const transcript = event.results?.[0]?.transcript ?? '';
          if (event.isFinal) {
            if (transcript.trim()) {
              committedRef.current.push(transcript.trim());
            }
            interimRef.current = '';
            setPartial('');
          } else {
            interimRef.current = transcript;
            setPartial(transcript);
          }
        }),
        speech.addListener('error', (event: SpeechErrorEvent) => {
          erroredRef.current = true;
          setError(event.message || event.error || 'Dictation failed.');
        }),
        speech.addListener('end', () => {
          clearSubs();
          const segments = [...committedRef.current];
          const tail = interimRef.current.trim();
          if (tail && segments[segments.length - 1] !== tail) {
            segments.push(tail);
          }
          const rawText = segments.join(' ').replace(/\s+/g, ' ').trim();
          setPartial('');
          if (rawText) {
            finishTake('review', rawText.length);
            setRaw(rawText);
            setStatus('review');
          } else {
            finishTake(erroredRef.current ? 'error' : 'empty', 0);
            setStatus('idle');
          }
        }),
      );
      speech.start(dictationStartOptions());
      startedAtRef.current = Date.now();
      setStatus('recording');
    } catch (err) {
      clearSubs();
      trackAnalyticsEvent('dictation_finished', {
        outcome: 'start_failed',
        durationSeconds: 0,
        chars: 0,
      });
      setError(err instanceof Error ? err.message : 'Could not start dictation.');
      setStatus('idle');
    }
  }, [clearSubs, finishTake]);

  const stop = useCallback(() => {
    try {
      getSpeechModule()?.stop();
    } catch {
      setStatus('idle');
    }
  }, []);

  /** Reader confirmed the transcript: return it verbatim and reset. */
  const confirm = useCallback(() => {
    const value = raw;
    trackAnalyticsEvent('dictation_reviewed', { outcome: 'confirmed', chars: value.length });
    setRaw('');
    setStatus('idle');
    return value;
  }, [raw]);

  /** Reader discarded the dictation: nothing is stored (audio was transient). */
  const discard = useCallback(() => {
    trackAnalyticsEvent('dictation_reviewed', { outcome: 'discarded', chars: raw.length });
    setRaw('');
    setPartial('');
    setStatus('idle');
  }, [raw]);

  return { status, partial, raw, error, start, stop, confirm, discard };
}
