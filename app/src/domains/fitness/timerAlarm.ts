import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

import { BUZZ_PATTERN } from './bell';
import {
  canScheduleExactAlarms,
  openExactAlarmSettings,
} from '../../../modules/exact-alarms';

/**
 * Background bell for the Sandglass (D-083).
 *
 * Android freezes JS timers once Bookmarkt leaves the screen, so the in-app
 * chime (`bell.ts`) only ever rang when the reader was looking at the timer.
 * When the glass is turned we also schedule a local notification for the
 * planned end, on a channel whose sound is the same `bell.wav`. The OS rings
 * it even with the screen off; if the app is in the foreground the handler
 * below swallows it and the in-app bell plays instead.
 *
 * `expo-notifications` is a native module that ships with runtime 1.0.4. The
 * JS bundle also reaches older installs over the air, so the module is loaded
 * lazily and every failure is swallowed: on an older runtime the Sandglass
 * behaves exactly as before.
 */
type NotificationsApi = typeof import('expo-notifications');

export const TIMER_ALARM_CHANNEL_ID = 'reading-timer';
export const TIMER_ALARM_KIND = 'reading-timer';
export const EXACT_ALARM_PROMPT_DECLINED_KEY = 'bookmarkt.timerAlarm.exactPromptDeclined';

/** How far past the planned end we assume the background ring already happened. */
export const LATE_CATCH_UP_GRACE_MS = 2000;

export interface TimerAlarmHandle {
  id: string;
  endsAtMs: number;
  /** Whether the OS allowed an exact alarm (Android 12-13 by default, Android 14+ only once "Alarms & reminders" is on). */
  exact: boolean;
}

export type TimerAlarmPermission = 'granted' | 'denied' | 'unavailable';

let api: NotificationsApi | null | undefined;
let prepared = false;

function getApi(): NotificationsApi | null {
  if (api !== undefined) return api;
  if (Platform.OS === 'web') {
    api = null;
    return api;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    api = require('expo-notifications') as NotificationsApi;
  } catch {
    api = null;
  }
  return api;
}

/** True when this binary carries the notifications module (Android builds from 1.0.4 on). */
export function isTimerAlarmAvailable(): boolean {
  return getApi() !== null;
}

/**
 * Builds the notification shown when the glass runs out. Pure, so the copy
 * is unit-testable without the native module.
 */
export function timerAlarmContent(input: { bookTitle: string | null; plannedMinutes: number }) {
  const minutes = Math.max(1, Math.round(input.plannedMinutes));
  const sitting = `${minutes}-minute sitting`;
  const title = 'The glass has run out';
  const body = input.bookTitle
    ? `Your ${sitting} with ${input.bookTitle} is done. Where did you stop?`
    : `Your ${sitting} is done. Where did you stop?`;
  return { title, body };
}

/**
 * Whether the catch-up that happens when the app returns to the screen should
 * stay silent because the scheduled notification already rang. Only trusted
 * when the alarm was exact; an inexact alarm may still be pending.
 */
export function bellAlreadyRang(
  alarm: Pick<TimerAlarmHandle, 'endsAtMs' | 'exact'> | null,
  nowMs: number,
): boolean {
  if (!alarm || !alarm.exact) return false;
  return nowMs - alarm.endsAtMs > LATE_CATCH_UP_GRACE_MS;
}

function isExactAlarmAllowed(): boolean {
  if (Platform.OS === 'ios') return true;
  return canScheduleExactAlarms() === true;
}

/**
 * Registers the channel and the foreground handler once per app run. Safe to
 * call repeatedly; a failure disables the feature for this run.
 */
async function prepare(): Promise<NotificationsApi | null> {
  const mod = getApi();
  if (!mod) return null;
  if (prepared) return mod;
  try {
    mod.setNotificationHandler({
      handleNotification: async (notification) => {
        const kind = (notification.request.content.data as { kind?: unknown } | null)?.kind;
        // While Bookmarkt is on screen the in-app bell rings; stay silent here so
        // the reader does not hear two chimes.
        const suppress = kind === TIMER_ALARM_KIND;
        return {
          shouldShowBanner: !suppress,
          shouldShowList: !suppress,
          shouldPlaySound: !suppress,
          shouldSetBadge: false,
        };
      },
    });
    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync(TIMER_ALARM_CHANNEL_ID, {
        name: 'Reading timer',
        description: 'Rings when a Sandglass sitting ends.',
        importance: mod.AndroidImportance.HIGH,
        sound: 'bell.wav',
        vibrationPattern: BUZZ_PATTERN,
        enableVibrate: true,
        lockscreenVisibility: mod.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: mod.AndroidAudioUsage.ALARM,
          contentType: mod.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
    prepared = true;
    return mod;
  } catch {
    api = null;
    return null;
  }
}

/**
 * Makes sure Bookmarkt may post notifications (a runtime prompt on Android 13+).
 * Resolves `unavailable` on runtimes without the module.
 */
export async function ensureTimerAlarmPermission(): Promise<TimerAlarmPermission> {
  const mod = await prepare();
  if (!mod) return 'unavailable';
  try {
    const current = await mod.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const requested = await mod.requestPermissionsAsync();
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function scheduleTimerAlarm(input: {
  endsAt: Date;
  bookTitle: string | null;
  plannedMinutes: number;
}): Promise<TimerAlarmHandle | null> {
  const mod = await prepare();
  if (!mod) return null;
  const endsAtMs = input.endsAt.getTime();
  if (endsAtMs <= Date.now()) return null;
  try {
    const content = timerAlarmContent(input);
    const id = await mod.scheduleNotificationAsync({
      content: {
        ...content,
        data: { kind: TIMER_ALARM_KIND },
        sound: 'bell.wav',
        vibrate: BUZZ_PATTERN,
        color: '#c9962f',
        priority: mod.AndroidNotificationPriority.HIGH,
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.DATE,
        date: endsAtMs,
        channelId: TIMER_ALARM_CHANNEL_ID,
      },
    });
    return { id, endsAtMs, exact: isExactAlarmAllowed() };
  } catch {
    return null;
  }
}

/** Cancels a pending alarm and clears it from the tray if it already showed. */
export async function clearTimerAlarm(alarm: TimerAlarmHandle | null): Promise<void> {
  if (!alarm) return;
  const mod = getApi();
  if (!mod) return;
  await Promise.all([
    mod.cancelScheduledNotificationAsync(alarm.id).catch(() => undefined),
    mod.dismissNotificationAsync(alarm.id).catch(() => undefined),
  ]);
}

/**
 * Whether the alarm's notification is sitting in the tray right now, which
 * proves it rang while the app was away.
 */
export async function timerAlarmIsPresented(alarm: TimerAlarmHandle | null): Promise<boolean> {
  if (!alarm) return false;
  const mod = getApi();
  if (!mod) return false;
  try {
    const presented = await mod.getPresentedNotificationsAsync();
    return presented.some((n) => n.request.identifier === alarm.id);
  } catch {
    return false;
  }
}

/**
 * Called when the in-app clock reaches zero. Reports whether the background
 * notification already rang (so the catch-up only buzzes) and clears it.
 */
export async function settleTimerAlarm(alarm: TimerAlarmHandle | null): Promise<boolean> {
  if (!alarm) return false;
  const alreadyRang = bellAlreadyRang(alarm, Date.now()) || (await timerAlarmIsPresented(alarm));
  void clearTimerAlarm(alarm);
  return alreadyRang;
}

/**
 * Android grants inexact alarms once the "Alarms & reminders" switch is
 * flipped mid-sitting, but the alarm already queued stays inexact. Re-queue it
 * so the bell lands on the minute. Returns the handle to keep using.
 */
export async function rescheduleTimerAlarmIfNowExact(
  alarm: TimerAlarmHandle | null,
  input: { bookTitle: string | null; plannedMinutes: number },
): Promise<TimerAlarmHandle | null> {
  if (!alarm || alarm.exact || !isExactAlarmAllowed()) return alarm;
  if (alarm.endsAtMs <= Date.now()) return alarm;
  const next = await scheduleTimerAlarm({ endsAt: new Date(alarm.endsAtMs), ...input });
  if (!next) return alarm;
  await clearTimerAlarm(alarm);
  return next;
}

/**
 * On Android 14+ the exact-alarm permission is off until the reader enables
 * it. Offer the settings page once; "Not now" is remembered.
 */
export async function maybePromptForExactAlarms(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (canScheduleExactAlarms() !== false) return;
  try {
    const declined = await AsyncStorage.getItem(EXACT_ALARM_PROMPT_DECLINED_KEY);
    if (declined === '1') return;
  } catch {
    return;
  }
  Alert.alert(
    'Ring on time with the screen off?',
    'Android holds timers back unless Bookmarkt may set alarms. Allow "Alarms & reminders" and the bell rings on the minute even when the app is in the background.',
    [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => {
          void AsyncStorage.setItem(EXACT_ALARM_PROMPT_DECLINED_KEY, '1').catch(() => undefined);
        },
      },
      {
        text: 'Open settings',
        onPress: () => {
          openExactAlarmSettings();
        },
      },
    ],
  );
}
