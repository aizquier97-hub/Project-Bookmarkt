import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { deleteBook, getBook, updateBook, type Book } from '@/domains/library/service';
import { colors } from '@/lib/theme';

export default function EditBookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
    enabled: validId,
  });

  if (!validId) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.error}>This book link is not valid.</Text>
      </View>
    );
  }
  if (bookQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Edit book details' }} />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (bookQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Edit book details' }} />
        <Text style={styles.error}>
          {bookQuery.error instanceof Error ? bookQuery.error.message : 'Could not load the book.'}
        </Text>
      </View>
    );
  }
  return <EditBookForm book={bookQuery.data} />;
}

function EditBookForm({ book }: { book: Book }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(book.name ?? '');
  const [author, setAuthor] = useState(book.author ?? '');
  const [publisher, setPublisher] = useState(book.publisher ?? '');
  const [publicationYear, setPublicationYear] = useState(
    book.publication_year ? String(book.publication_year) : '',
  );
  const [totalPages, setTotalPages] = useState(book.total_pages ? String(book.total_pages) : '');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBook(book.id, { name, author, publisher, publicationYear, totalPages }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book', book.id] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the book details.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      router.dismissTo('/');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not delete the book.');
    },
  });

  const busy = updateMutation.isPending || deleteMutation.isPending;

  const handleDelete = () => {
    Alert.alert(
      'Delete book',
      'Delete this book and all related entries, character maps, and image records?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Edit book details' }} />

        <Text style={styles.label}>Book title *</Text>
        <TextInput
          style={styles.input}
          placeholder="Book title"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Author *</Text>
        <TextInput
          style={styles.input}
          placeholder="Author name"
          placeholderTextColor={colors.muted}
          value={author}
          onChangeText={setAuthor}
        />

        <Text style={styles.label}>Publisher</Text>
        <TextInput
          style={styles.input}
          placeholder="Publisher"
          placeholderTextColor={colors.muted}
          value={publisher}
          onChangeText={setPublisher}
        />

        <Text style={styles.label}>Publication year</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 1984"
          placeholderTextColor={colors.muted}
          value={publicationYear}
          onChangeText={setPublicationYear}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Total pages</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 336"
          placeholderTextColor={colors.muted}
          value={totalPages}
          onChangeText={setTotalPages}
          keyboardType="number-pad"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.saveButton} onPress={() => updateMutation.mutate()} disabled={busy}>
          {updateMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Save changes</Text>
          )}
        </Pressable>

        <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={busy}>
          <Text style={styles.deleteButtonText}>
            {deleteMutation.isPending ? 'Deleting...' : 'Delete this book'}
          </Text>
        </Pressable>

        <View style={styles.footerSpace} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  stateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  deleteButton: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteButtonText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 15,
  },
  footerSpace: {
    height: 40,
  },
});
