import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { deleteAccount } from '@/domains/account/service';
import { fetchExportPayload, serializeExport } from '@/domains/account/export';
import { useAuth } from '@/domains/auth/AuthProvider';
import { requestPasswordReset, signOut } from '@/domains/auth/service';
import { cardShadow, colors, fonts } from '@/lib/theme';

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
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = () => {
    const address = session?.user?.email;
    if (!address) {
      setError('No account email found. Sign in again first.');
      return;
    }
    Alert.alert('Change password', `Send a password-reset link to ${address}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: async () => {
          try {
            setError(null);
            await requestPasswordReset(address, Linking.createURL('/reset-password'));
            Alert.alert('Check your email', 'The reset link opens back in Bookmarkt.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'The reset email could not be sent.');
          }
        },
      },
    ]);
  };

  // Data export (Stage 4 Phase 4): the reader's books, entries, character
  // maps, voice transcripts, and bookmark codes as JSON via the share sheet.
  const handleExport = async () => {
    if (exporting) {
      return;
    }
    setError(null);
    setExporting(true);
    try {
      const payload = await fetchExportPayload();
      await Share.share({ title: 'Bookmarkt export', message: serializeExport(payload) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export could not be prepared.');
    } finally {
      setExporting(false);
    }
  };

  // Account deletion (Stage 4 Phase 4): two explicit confirmations, then the
  // server erases everything and releases the bookmark codes.
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This permanently erases your books, entries, character maps, images, and voice transcripts, and releases your QR bookmark codes. Consider exporting your data first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert('This cannot be undone', 'Delete your Bookmarkt account forever?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  setError(null);
                  setDeleting(true);
                  try {
                    await deleteAccount();
                    try {
                      await signOut();
                    } catch {
                      // The server session is already gone; local state follows.
                    }
                    queryClient.clear();
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Your account could not be deleted.',
                    );
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  };

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
        <View style={[styles.row, styles.rowDivider]}>
          <Ionicons name="person-circle-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{email}</Text>
            <Text style={styles.rowSub}>Your entries and maps sync to this account.</Text>
          </View>
        </View>
        <Pressable
          style={styles.row}
          onPress={handleChangePassword}
          accessibilityRole="button"
          accessibilityLabel="Change password"
        >
          <Ionicons name="key-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Change password</Text>
            <Text style={styles.rowSub}>We email you a secure reset link.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Subscription</Text>
      <View style={styles.group}>
        <Pressable
          style={styles.row}
          onPress={() => router.push('/subscription')}
          accessibilityRole="button"
          accessibilityLabel="Companion subscription"
        >
          <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Book Club subscription</Text>
            <Text style={styles.rowSub}>Plans, status, and restoring purchases.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
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

      <Text style={styles.sectionLabel}>Your data</Text>
      <View style={styles.group}>
        <Pressable
          style={[styles.row, styles.rowDivider]}
          onPress={() => void handleExport()}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Export your data"
        >
          <Ionicons name="download-outline" size={22} color={colors.accent} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>Export your data</Text>
            <Text style={styles.rowSub}>
              Books, entries, character maps, and transcripts as JSON.
            </Text>
          </View>
          {exporting ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          )}
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={handleDeleteAccount}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowTitle, styles.dangerText]}>Delete account</Text>
            <Text style={styles.rowSub}>Permanently erase everything. Cannot be undone.</Text>
          </View>
          {deleting ? <ActivityIndicator size="small" color={colors.muted} /> : null}
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
    fontFamily: fonts.serif,
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
    ...cardShadow,
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
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12.5,
    marginTop: 1,
  },
  dangerText: {
    fontFamily: fonts.serif,
    color: colors.danger,
  },
  error: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
});
