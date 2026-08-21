import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/domains/auth/AuthProvider';
import { colors } from '@/lib/theme';

export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return null;
  }
  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
