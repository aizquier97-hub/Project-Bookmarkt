import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addBook } from '@/domains/library/service';
import { colors } from '@/lib/theme';

export default function AddBookScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addBookMutation = useMutation({
    mutationFn: addBook,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not add the book.');
    },
  });

  const handleSave = () => {
    setError(null);
    addBookMutation.mutate({ name, author, publisher, publicationYear, totalPages });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Add a book' }} />

        <Text style={styles.label}>Book title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Don Quixote"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Author</Text>
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
          placeholder="e.g., Ace Books"
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

        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
          disabled={addBookMutation.isPending}
        >
          {addBookMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Add book</Text>
          )}
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
  footerSpace: {
    height: 40,
  },
});
