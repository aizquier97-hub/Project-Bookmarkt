import { Vibration } from 'react-native';

/**
 * The Sandglass's end-of-sitting chime (D-077): a short, soft synthesized
 * bowl tone that tells the reader their time is up without startling them.
 *
 * `expo-audio` is a native module that shipped with runtime 1.0.2. The JS
 * bundle also updates older installs over the air, so the module is loaded
 * lazily and every failure is swallowed: on a runtime without it the glass
 * still buzzes, it just stays silent.
 */
interface AudioApi {
  setAudioModeAsync(mode: { playsInSilentMode?: boolean; interruptionMode?: string }): Promise<void>;
  createAudioPlayer(source: number): { play(): void; remove(): void };
}

const BELL_RELEASE_MS = 4000;
export const BUZZ_PATTERN = [0, 350, 150, 350];

let loadFailed = false;

export interface PlayTimerBellOptions {
  /**
   * Buzz without the chime. Used when the Sandglass catches up after the
   * scheduled notification (D-083) has already rung in the background, so the
   * reader does not hear the bell twice.
   */
  vibrateOnly?: boolean;
}

export function playTimerBell(options: PlayTimerBellOptions = {}): void {
  Vibration.vibrate(BUZZ_PATTERN);
  if (options.vibrateOnly || loadFailed) {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as AudioApi;
    const source = require('../../../assets/sounds/bell.wav') as number;
    void audio
      .setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' })
      .catch(() => undefined)
      .then(() => {
        const player = audio.createAudioPlayer(source);
        player.play();
        setTimeout(() => {
          try {
            player.remove();
          } catch {
            // Already released.
          }
        }, BELL_RELEASE_MS);
      })
      .catch(() => undefined);
  } catch {
    loadFailed = true;
  }
}
