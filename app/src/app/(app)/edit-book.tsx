import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  coverFillUpdates,
  type CoverAutoFill,
  type CoverCandidate,
} from '@/domains/library/covers';
import { deleteBook, getBook, updateBook, type Book } from '@/domains/library/service';
import { CoverPicker } from '@/components/CoverPicker';
import { ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { colors } from '@/lib/theme';

export default function EditBookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
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
        <LoadingState label="Loading book…" />
      </View>
    );
  }
  if (bookQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Edit book details' }} />
        <ErrorState
          error={bookQuery.error}
          fallback="Could not load the book."
          onRetry={() => void bookQuery.refetch()}
        />
      </View>
    );
  }
  return <EditBookForm book={bookQuery.data} />;
}

function EditBookForm({ book }: { book: Book }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState(book.name ?? '');
  const [author, setAuthor] = useState(book.author ?? '');
  const [totalPages, setTotalPages] = useState(book.total_pages ? String(book.total_pages) : '');
  const [coverUrl, setCoverUrl] = useState<string | null>(book.cover_url ?? null);
  const [isbn, setIsbn] = useState<string | null>(book.isbn ?? null);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateBook(book.id, {
        name,
        author,
        // Publisher/year are no longer collected (D-032); stored values on
        // older books pass through untouched.
        publisher: book.publisher ?? '',
        publicationYear: book.publication_year ? String(book.publication_year) : '',
        totalPages,
        coverUrl,
        isbn,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      void queryClient.invalidateQueries({ queryKey: queryKeys.book(book.id) });
      showToast('Book details saved.', 'success');
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the book details.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      showToast('Book deleted.', 'success');
      router.dismissTo('/');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not delete the book.');
    },
  });

  const busy = updateMutation.isPending || deleteMutation.isPending;

  // Picking a cover fills blank details from the matched edition; switching
  // to another cover swaps values a previous pick supplied. Typed and stored
  // input always wins, with a one-tap Undo (D-033, D-044).
  const coverAutoFillRef = useRef<CoverAutoFill>({ author: null, pages: null });
  const handleCoverCandidate = (candidate: CoverCandidate) => {
    const updates = coverFillUpdates(candidate, { author, totalPages }, coverAutoFillRef.current);
    if (!updates.author && !updates.pages) {
      return;
    }
    const prevAuthor = author;
    const prevPages = totalPages;
    const prevAuto = { ...coverAutoFillRef.current };
    if (updates.author) {
      setAuthor(updates.author);
      coverAutoFillRef.current.author = updates.author;
    }
    if (updates.pages) {
      setTotalPages(updates.pages);
      coverAutoFillRef.current.pages = updates.pages;
    }
    const message =
      updates.author && updates.pages
        ? 'Author and pages updated from the cover match - pages vary by edition.'
        : updates.author
          ? 'Author updated from the cover match.'
          : 'Pages updated from the cover match - pages vary by edition.';
    showToast(message, 'info', {
      label: 'Undo',
      onPress: () => {
        if (updates.author) setAuthor(prevAuthor);
        if (updates.pages) setTotalPages(prevPages);
        coverAutoFillRef.current = prevAuto;
      },
    });
  };

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

  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      >
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

        <Text style={styles.label}>Total pages</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 336"
          placeholderTextColor={colors.muted}
          value={totalPages}
          onChangeText={setTotalPages}
          keyboardType="number-pad"
        />

        <CoverPicker
          title={name}
          author={author}
          coverUrl={coverUrl}
          onChange={setCoverUrl}
          onCandidateSelected={handleCoverCandidate}
          isbnLookup
          onIsbnResolved={setIsbn}
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
