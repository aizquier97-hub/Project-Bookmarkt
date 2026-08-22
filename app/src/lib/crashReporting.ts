// Crash flight recorder: every unhandled JS error is written to our own
// analytics_events table (event_name 'app_error') with the message, stack,
// and which update the app was running - so a release-build crash on a
// reader's phone can be diagnosed remotely. Native-level crashes (before JS
// runs) can't be caught here; a real crash SDK is Stage 5 scope.

import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { supabase } from './supabase';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
}

function describeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return {
      message: error.message.slice(0, 600),
      stack: (error.stack ?? '').slice(0, 2400),
    };
  }
  return { message: String(error).slice(0, 600), stack: '' };
}

/**
 * Fire one app_error report. Never throws; resolves when the row is written
 * (or the attempt failed) so fatal handlers can hold the process briefly.
 */
export async function reportAppError(
  source: string,
  error: unknown,
  extra: { isFatal?: boolean } = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      return;
    }
    const { message, stack } = describeError(error);
    await supabase.from('analytics_events').insert({
      user_id: userId,
      topic_id: null,
      event_name: 'app_error',
      event_properties: {
        source,
        message,
        stack,
        isFatal: Boolean(extra.isFatal),
        platform: Platform.OS,
        updateId: Updates.updateId ?? null,
        embeddedLaunch: Updates.isEmbeddedLaunch ?? null,
      },
    });
  } catch {
    // Reporting must never make things worse.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let installed = false;

/**
 * Wrap React Native's global error handler. On a fatal error the report is
 * given up to 2s to reach the server before the original handler (which
 * tears the app down in release builds) runs.
 */
export function installGlobalCrashReporter(): void {
  if (installed) {
    return;
  }
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils) {
    return;
  }
  installed = true;
  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void Promise.race([reportAppError('global', error, { isFatal }), delay(2000)]).finally(() => {
      previousHandler(error, isFatal);
    });
  });
}
