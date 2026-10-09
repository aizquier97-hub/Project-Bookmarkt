// Guarded access to the native on-device speech recognizer (D-016).
// The module only exists in development/production builds that include the
// expo-speech-recognition config plugin. In Expo Go the require throws, we
// cache null, and the app degrades gracefully to typed entry. No raw audio is
// ever written to disk or uploaded: the platform recognizer streams audio
// transiently and only transcripts leave this module.
//
// On iOS the usage string promises "audio never leaves your phone", so
// dictation is offered only when Apple's on-device recognizer is available
// for the device language and every session asks for it explicitly (D-085).

import { Platform } from 'react-native';

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

export interface SpeechStartOptions {
  interimResults?: boolean;
  continuous?: boolean;
  /** Keep audio on the device (honoured only where the OS recognizer supports it). */
  requiresOnDeviceRecognition?: boolean;
  addsPunctuation?: boolean;
  iosTaskHint?: 'unspecified' | 'dictation' | 'search' | 'confirmation';
}

interface SpeechModule {
  isRecognitionAvailable(): boolean;
  /** Older module builds may lack this; treat absence as "unknown". */
  supportsOnDeviceRecognition?(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: SpeechStartOptions): void;
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

/**
 * Whether dictation may be offered on this platform given what the recognizer
 * reports. Pure so the iOS rule is unit-testable: iOS needs on-device support
 * (the library falls back to Apple's servers otherwise); Android keeps the
 * existing availability rule.
 */
export function dictationOffered(
  platform: string,
  recognizer: { available: boolean; onDevice: boolean | null },
): boolean {
  if (!recognizer.available) return false;
  if (platform === 'ios') return recognizer.onDevice === true;
  return true;
}

/** Options for every `start()` call; on iOS they pin recognition to the device. */
export function dictationStartOptions(platform: string = Platform.OS): SpeechStartOptions {
  if (platform === 'ios') {
    return {
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      iosTaskHint: 'dictation',
    };
  }
  return { interimResults: true, continuous: true };
}

export function isDictationAvailable(): boolean {
  const speech = getSpeechModule();
  if (!speech) {
    return false;
  }
  try {
    const available = speech.isRecognitionAvailable();
    let onDevice: boolean | null = null;
    if (typeof speech.supportsOnDeviceRecognition === 'function') {
      onDevice = speech.supportsOnDeviceRecognition();
    }
    return dictationOffered(Platform.OS, { available, onDevice });
  } catch {
    return false;
  }
}
