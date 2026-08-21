import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { signOut } from '@/domains/auth/service';
import { listBooks } from '@/domains/library/service';
import { cardShadow, colors, fonts, spineColorFor } from '@/lib/theme';

export default function LibraryScreen() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const booksQuery = useQuery({ queryKey: ['books'], queryFn: listBooks });

  const handleSignOut = async () => {
    try {
      await signOut();
      // Cross-account hygiene: drop every cached row before the next user.
      queryClient.clear();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Your library',
          headerRight: () => (
            <Pressable onPress={handleSignOut} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          ),
        }}
      />

      <Link href="/add-book" asChild>
        <Pressable style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add a book</Text>
        </Pressable>
      </Link>

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {booksQuery.isPending ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : booksQuery.isError ? (
        <Text style={styles.error}>
          {booksQuery.error instanceof Error
            ? booksQuery.error.message
            : 'Could not load your library.'}
        </Text>
      ) : booksQuery.data.length === 0 ? (
        <Text style={styles.empty}>
          Your shelf is empty. Add the book you are reading to start capturing entries.
        </Text>
      ) : (
        <FlatList
          data={booksQuery.data}
          keyExtractor={(book) => String(book.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Link href={{ pathname: '/book/[id]', params: { id: String(item.id) } }} asChild>
              <Pressable>
                <View style={styles.bookCard}>
                  <View style={[styles.bookSpine, { backgroundColor: spineColorFor(item.id) }]} />
                  <View style={styles.bookBody}>
                    <Text style={styles.bookTitle}>{item.name}</Text>
                    {item.author ? <Text style={styles.bookAuthor}>{item.author}</Text> : null}
                    {item.total_pages ? (
                      <Text style={styles.bookPages}>{item.total_pages} pages</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.shelfEdge} />
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  signOut: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
  },
  loader: {
    marginTop: 40,
  },
  list: {
    gap: 14,
    paddingBottom: 24,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  bookSpine: {
    width: 10,
  },
  bookBody: {
    flex: 1,
    padding: 16,
  },
  bookTitle: {
    color: colors.text,
    fontSize: 19,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  bookAuthor: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    marginTop: 4,
  },
  bookPages: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  shelfEdge: {
    height: 5,
    backgroundColor: colors.shelf,
    borderRadius: 3,
    marginTop: 3,
    marginHorizontal: 4,
    opacity: 0.55,
  },
});
