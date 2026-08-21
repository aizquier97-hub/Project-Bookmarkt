// Guarded access to the native on-device speech recognizer (D-016).
// The module only exists in development/production builds that include the
// expo-speech-recognition config plugin. In Expo Go the require throws, we
// cache null, and the app degrades gracefully to typed entry. No raw audio is
// ever written to disk or uploaded: the platform recognizer streams audio
// transiently and only transcripts leave this module.

export interface SpeechResultEvent {
  isFinal?: boolean;
  results?: { transcript?: string }[];
}

export interface SpeechErrorEvent {
  error?: string;
  message?: string;
}

export interface SpeechSubscription {
  remove(): void;
}

interface SpeechModule {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: { interimResults?: boolean; continuous?: boolean }): void;
  stop(): void;
  abort(): void;
  addListener(
    eventName: 'result' | 'error' | 'end' | 'start',
    listener: (event: never) => void,
  ): SpeechSubscription;
}

interface SpeechApi {
  ExpoSpeechRecognitionModule: SpeechModule;
}

let cachedModule: SpeechModule | null | undefined;

export function getSpeechModule(): SpeechModule | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('expo-speech-recognition') as SpeechApi;
    cachedModule = api.ExpoSpeechRecognitionModule ?? null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function isDictationAvailable(): boolean {
  const speech = getSpeechModule();
  if (!speech) {
    return false;
  }
  try {
    return speech.isRecognitionAvailable();
  } catch {
    return false;
  }
}
