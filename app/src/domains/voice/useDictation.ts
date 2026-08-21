import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getSpeechModule,
  isDictationAvailable,
  type SpeechErrorEvent,
  type SpeechResultEvent,
  type SpeechSubscription,
} from '@/domains/voice/recognition';

export type DictationStatus = 'unavailable' | 'idle' | 'recording' | 'review';

/**
 * Dictation state machine (D-016): idle → recording (live partials) →
 * review (verbatim raw transcript awaiting reader confirmation) → idle.
 * The caller reads `raw` in the review state and must let the reader confirm
 * or discard before any text is stored.
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

  const clearSubs = useCallback(() => {
    subsRef.current.forEach((sub) => sub.remove());
    subsRef.current = [];
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
    try {
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        setError('Microphone permission is required for dictation.');
        return;
      }
      committedRef.current = [];
      interimRef.current = '';
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
            setRaw(rawText);
            setStatus('review');
          } else {
            setStatus('idle');
          }
        }),
      );
      speech.start({ interimResults: true, continuous: true });
      setStatus('recording');
    } catch (err) {
      clearSubs();
      setError(err instanceof Error ? err.message : 'Could not start dictation.');
      setStatus('idle');
    }
  }, [clearSubs]);

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
    setRaw('');
    setStatus('idle');
    return value;
  }, [raw]);

  /** Reader discarded the dictation: nothing is stored (audio was transient). */
  const discard = useCallback(() => {
    setRaw('');
    setPartial('');
    setStatus('idle');
  }, []);

  return { status, partial, raw, error, start, stop, confirm, discard };
}
