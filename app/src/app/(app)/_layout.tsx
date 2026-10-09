import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FirstRunTour } from '@/components/FirstRunTour';
import { renderStackHeader } from '@/components/ui/navigationHeaders';
import { useAuth } from '@/domains/auth/AuthProvider';
import { ComprehensionBackfill } from '@/domains/fitness/ComprehensionBackfill';
import { DifficultyBackfill } from '@/domains/fitness/DifficultyBackfill';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { AppOpenTracker } from '@/domains/reporting/AppOpenTracker';
import { colors } from '@/lib/theme';

export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return null;
  }
  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <>
      {/* Dark status-bar icons over the parchment headers (D-089). */}
      <StatusBar style="dark" />
      <AppOpenTracker />
      <DifficultyBackfill />
      <ComprehensionBackfill />
      <Stack
        screenOptions={{
          // Shared parchment header with a left-aligned Lora title (D-089).
          header: renderStackHeader,
          contentStyle: { backgroundColor: colors.background },
        }}
        // Which screens readers reach (D-086): route names only - the tab
        // bar reports its own tabs, and ids never leave the path params.
        screenListeners={({ route }) => ({
          focus: () => {
            if (route.name !== '(tabs)') {
              trackAnalyticsEvent('screen_viewed', { screen: route.name });
            }
          },
        })}
      >
        {/* The tab navigator draws its own header per tab. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* The entry composer's own page (D-092); title set per kind on the screen. */}
        <Stack.Screen name="compose-entry" options={{ title: 'Save an entry' }} />
      </Stack>
      {/* Once per device, over whatever screen the reader landed on (D-084). */}
      <FirstRunTour />
    </>
  );
}
