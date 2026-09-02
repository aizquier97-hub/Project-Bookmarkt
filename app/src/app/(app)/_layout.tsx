import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/domains/auth/AuthProvider';
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
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontFamily: fonts.serif },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The tab navigator draws its own header per tab. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
