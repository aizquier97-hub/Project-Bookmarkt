import { Platform } from 'react-native';

type ExactAlarmsNative = {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): boolean;
};

let native: ExactAlarmsNative | null | undefined;

/**
 * Resolves the native module lazily so an OTA bundle that lands on a binary built before
 * this module existed degrades to "exact alarms unknown" instead of crashing at import time.
 */
function getNative(): ExactAlarmsNative | null {
  if (native !== undefined) return native;
  if (Platform.OS !== 'android') {
    native = null;
    return native;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core') as typeof import('expo-modules-core');
    native = requireNativeModule<ExactAlarmsNative>('ExactAlarms');
  } catch {
    native = null;
  }
  return native;
}

/** True when the module is available in this binary (Android builds from 1.0.4 on). */
export function isExactAlarmsAvailable(): boolean {
  return getNative() !== null;
}

/**
 * Whether the OS will let Bookmarkt fire the timer bell at the exact second. Below Android 12
 * this is always true; Android 12-13 grant it at install; Android 14+ deny it until the user
 * flips "Alarms & reminders". Returns `null` when the native module is missing.
 */
export function canScheduleExactAlarms(): boolean | null {
  const mod = getNative();
  if (!mod) return null;
  try {
    return mod.canScheduleExactAlarms();
  } catch {
    return null;
  }
}

/** Opens the system "Alarms & reminders" page for Bookmarkt. Returns false if it could not. */
export function openExactAlarmSettings(): boolean {
  const mod = getNative();
  if (!mod) return false;
  try {
    return mod.openExactAlarmSettings();
  } catch {
    return false;
  }
}
