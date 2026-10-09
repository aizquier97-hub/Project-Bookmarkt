import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/domains/auth/AuthProvider';
import { ComprehensionBackfill } from '@/domains/fitness/ComprehensionBackfill';
import { DifficultyBackfill } from '@/domains/fitness/DifficultyBackfill';
import { FirstRunTour } from '@/components/FirstRunTour';
import { colors, fonts } from '@/lib/theme';

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
      {/* Light status-bar icons over the dark walnut headers (D-054). */}
      <StatusBar style="light" />
      <DifficultyBackfill />
      <ComprehensionBackfill />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.walnut },
          headerTintColor: colors.onWalnut,
          headerTitleStyle: { fontWeight: '700', fontFamily: fonts.serif },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* The tab navigator draws its own header per tab. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      {/* Once per device, over whatever screen the reader landed on (D-084). */}
      <FirstRunTour />
    </>
  );
}
