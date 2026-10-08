import { Platform } from 'react-native';

import {
  bellAlreadyRang,
  clearTimerAlarm,
  ensureTimerAlarmPermission,
  LATE_CATCH_UP_GRACE_MS,
  scheduleTimerAlarm,
  settleTimerAlarm,
  timerAlarmContent,
} from '@/domains/fitness/timerAlarm';
import { canScheduleExactAlarms, isExactAlarmsAvailable } from '../../../../modules/exact-alarms';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The native bridges are absent under Jest, exactly like an OTA bundle landing
// on a binary older than 1.0.4.
jest.mock('expo-modules-core', () => ({
  requireNativeModule: () => {
    throw new Error("Cannot find native module 'ExactAlarms'");
  },
}));
jest.mock('expo-notifications', () => {
  throw new Error("Cannot find native module 'ExpoNotificationScheduler'");
});

describe('timerAlarmContent', () => {
  it('names the book and the planned length', () => {
    expect(timerAlarmContent({ bookTitle: 'Middlemarch', plannedMinutes: 25 })).toEqual({
      title: 'The glass has run out',
      body: 'Your 25-minute sitting with Middlemarch is done. Where did you stop?',
    });
  });

  it('copes without a title and never says "0-minute"', () => {
    expect(timerAlarmContent({ bookTitle: null, plannedMinutes: 0.2 }).body).toBe(
      'Your 1-minute sitting is done. Where did you stop?',
    );
  });
});

describe('bellAlreadyRang', () => {
  const endsAtMs = 1_000_000;

  it('is false without an alarm', () => {
    expect(bellAlreadyRang(null, endsAtMs + 60_000)).toBe(false);
  });

  it('is false while the clock is within the grace window', () => {
    expect(bellAlreadyRang({ endsAtMs, exact: true }, endsAtMs + LATE_CATCH_UP_GRACE_MS)).toBe(false);
  });

  it('is true once an exact alarm is clearly in the past', () => {
    expect(bellAlreadyRang({ endsAtMs, exact: true }, endsAtMs + LATE_CATCH_UP_GRACE_MS + 1)).toBe(true);
  });

  it('never trusts an inexact alarm to have rung', () => {
    expect(bellAlreadyRang({ endsAtMs, exact: false }, endsAtMs + 600_000)).toBe(false);
  });
});

describe('without the native modules', () => {
  it('reports the exact-alarm bridge as missing', () => {
    expect(Platform.OS).toBe('ios');
    expect(isExactAlarmsAvailable()).toBe(false);
    expect(canScheduleExactAlarms()).toBeNull();
  });

  it('degrades to the in-app bell instead of throwing', async () => {
    await expect(ensureTimerAlarmPermission()).resolves.toBe('unavailable');
    await expect(
      scheduleTimerAlarm({ endsAt: new Date(Date.now() + 60_000), bookTitle: 'Dune', plannedMinutes: 1 }),
    ).resolves.toBeNull();
    await expect(settleTimerAlarm(null)).resolves.toBe(false);
    await expect(clearTimerAlarm({ id: 'x', endsAtMs: 0, exact: true })).resolves.toBeUndefined();
  });
});
