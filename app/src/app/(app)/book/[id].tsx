import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { listCharacters } from '@/domains/characters/service';
import { listEntries } from '@/domains/entries/service';
import { getBook } from '@/domains/library/service';
import { colors } from '@/lib/theme';

export default function BookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const entriesQuery = useQuery({
    queryKey: ['entries', bookId],
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });
  const charactersQuery = useQuery({
    queryKey: ['characters', bookId],
    queryFn: () => listCharacters(bookId),
    enabled: validId,
  });

  if (!validId) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const characterCount = charactersQuery.data?.length ?? 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: bookQuery.data?.name ?? 'Book' }} />

      {bookQuery.data?.author ? (
        <Text style={styles.author}>by {bookQuery.data.author}</Text>
      ) : null}
      <Text style={styles.meta}>
        {characterCount} character{characterCount === 1 ? '' : 's'} mapped
      </Text>

      <Text style={styles.sectionTitle}>Reading entries</Text>

      {entriesQuery.isPending ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : entriesQuery.isError ? (
        <Text style={styles.error}>
          {entriesQuery.error instanceof Error
            ? entriesQuery.error.message
            : 'Could not load entries.'}
        </Text>
      ) : entriesQuery.data.length === 0 ? (
        <Text style={styles.empty}>No entries yet for this book.</Text>
      ) : (
        <FlatList
          data={entriesQuery.data}
          keyExtractor={(entry) => String(entry.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.entryCard}>
              <Text style={styles.entryText}>{item.text}</Text>
              {item.created_at ? (
                <Text style={styles.entryDate}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              ) : null}
            </View>
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
  author: {
    color: colors.muted,
    fontSize: 15,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  loader: {
    marginTop: 24,
  },
  error: {
    color: colors.danger,
    marginTop: 8,
  },
  empty: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 15,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  entryCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  entryText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  entryDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
});
