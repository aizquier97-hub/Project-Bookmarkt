import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/domains/auth/AuthProvider';
import { signOut } from '@/domains/auth/service';
import { colors } from '@/lib/theme';

/**
 * Settings home (J9): account, library shortcuts, and support in one
 * grouped list - the iOS Settings / Apple Books pattern. Sign-out moved
 * here from the shelf header so the destructive action sits behind an
 * intentional tap, not next to everyday navigation.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email ?? 'Signed in';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of Bookmarkt on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            // Cross-account hygiene: drop every cached row before the next user.
            queryClient.clear();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign-out failed.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{email}</Text>
            <Text style={styles.rowSub}>Your entries and maps sync to this account.</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Your library</Text>
      <View style={styles.group}>
        <Pressable
          style={styles.row}
          onPress={() => router.push('/bookmarks')}
          accessibilityRole="button"
          accessibilityLabel="Your QR bookmarks"
        >
          <Ionicons name="bookmark-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Your QR bookmarks</Text>
            <Text style={styles.rowSub}>Link a bookmark to jump straight to a book.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.group}>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => router.push('/report-issue')}
          accessibilityRole="button"
          accessibilityLabel="Report an issue"
        >
          <Ionicons name="flag-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Report an issue</Text>
            <Text style={styles.rowSub}>Something broken or confusing? Tell us.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Bookmarkt</Text>
            <Text style={styles.rowSub}>Version {version}</Text>
          </View>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.signOutButton}
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 18,
    marginLeft: 4,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    color: colors.muted,
    fontSize: 12.5,
    marginTop: 1,
  },
  error: {
    color: colors.danger,
    marginTop: 14,
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 26,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
