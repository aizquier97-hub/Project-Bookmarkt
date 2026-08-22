import { Ionicons } from '@expo/vector-icons';
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

import { lookupBookByIsbn, normalizeIsbn } from '@/domains/library/covers';
import { resolveBookMetadata } from '@/domains/library/metadata';
import { addBook, type Book } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { CoverPicker } from '@/components/CoverPicker';
import { IsbnScanner, isBarcodeScannerAvailable } from '@/components/IsbnScanner';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { colors } from '@/lib/theme';

async function addBookWithLookup(input: {
  name: string;
  author: string;
  publisher: string;
  publicationYear: string;
  totalPages: string;
  coverUrl: string | null;
  isbn: string | null;
}): Promise<Book> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Book title is required.');
  }
  // PWA contract: manual fields win, Open Library fills whatever is missing.
  const metadata = await resolveBookMetadata({
    title: name,
    author: input.author,
    manualPublisher: input.publisher,
    manualPublicationYear: input.publicationYear,
    manualTotalPages: input.totalPages,
  });
  return addBook({
    name,
    author: input.author,
    publisher: metadata.publisher,
    publicationYear: metadata.publicationYear,
    totalPages: metadata.totalPages,
    coverUrl: input.coverUrl,
    isbn: input.isbn,
  }).then((book) => {
    // PWA parity: same event name and property shape (new props additive).
    trackAnalyticsEvent(
      'book_added',
      {
        topicId: String(book.id),
        hasAuthor: Boolean(input.author.trim()),
        hasMetadata: Boolean(
          metadata.publisher || metadata.publicationYear || metadata.totalPages,
        ),
        hasCover: Boolean(input.coverUrl),
        viaIsbn: Boolean(input.isbn),
      },
      book.id,
    );
    return book;
  });
}

export default function AddBookScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [isbnField, setIsbnField] = useState('');
  const [storedIsbn, setStoredIsbn] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scannerAvailable = isBarcodeScannerAvailable();

  const addBookMutation = useMutation({
    mutationFn: addBookWithLookup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      showToast('Book added to your shelf.', 'success');
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not add the book.');
    },
  });

  // One lookup fills everything the reader has not already typed: scanned
  // or typed ISBN resolves title, author, publisher, year, pages, cover.
  const applyIsbn = async (raw: string) => {
    const normalized = normalizeIsbn(raw);
    if (!normalized) {
      setError('That does not look like a valid ISBN - check the digits.');
      return;
    }
    setError(null);
    setIsbnField(normalized);
    setStoredIsbn(normalized);
    setLookupBusy(true);
    try {
      const found = await lookupBookByIsbn(normalized);
      if (!found) {
        setError('No match for that ISBN - fill the details in and add it anyway.');
        return;
      }
      // Manual input wins; the lookup only fills the blanks (PWA contract).
      if (!name.trim() && found.title) setName(found.title);
      if (!author.trim() && found.author) setAuthor(found.author);
      if (!publisher.trim() && found.publisher) setPublisher(found.publisher);
      if (!publicationYear.trim() && found.publicationYear) {
        setPublicationYear(String(found.publicationYear));
      }
      if (!totalPages.trim() && found.totalPages) setTotalPages(String(found.totalPages));
      if (!coverUrl && found.coverUrl) setCoverUrl(found.coverUrl);
      showToast(`Found "${found.title}".`, 'success');
    } catch {
      setError('The lookup timed out - you can still add the book by hand.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleScanned = (digits: string) => {
    setScannerOpen(false);
    void applyIsbn(digits);
  };

  const handleSave = () => {
    setError(null);
    addBookMutation.mutate({
      name,
      author,
      publisher,
      publicationYear,
      totalPages,
      coverUrl,
      isbn: storedIsbn,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Add a book' }} />

        {scannerAvailable ? (
          <Pressable
            style={styles.scanCard}
            onPress={() => setScannerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Scan the book's barcode"
          >
            <Ionicons name="barcode-outline" size={30} color={colors.accent} />
            <View style={styles.scanCardTextWrap}>
              <Text style={styles.scanCardTitle}>Scan the barcode</Text>
              <Text style={styles.scanCardSub}>
                Point at the back cover - title, author, and cover fill in for you.
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.label}>ISBN{scannerAvailable ? ' (or scan above)' : ''}</Text>
        <View style={styles.isbnRow}>
          <TextInput
            style={[styles.input, styles.isbnInput]}
            placeholder="e.g., 9780143039433"
            placeholderTextColor={colors.muted}
            value={isbnField}
            onChangeText={setIsbnField}
            keyboardType="number-pad"
          />
          <Pressable
            style={styles.lookupButton}
            onPress={() => void applyIsbn(isbnField)}
            disabled={lookupBusy || !isbnField.trim()}
            accessibilityRole="button"
            accessibilityLabel="Look up this ISBN"
          >
            {lookupBusy ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.lookupButtonText}>Look up</Text>
            )}
          </Pressable>
        </View>

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

        <CoverPicker title={name} author={author} coverUrl={coverUrl} onChange={setCoverUrl} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          Leave publisher, year, or pages blank and we will try to fill them from Open Library.
        </Text>

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

      <IsbnScanner
        visible={scannerOpen}
        onScanned={handleScanned}
        onClose={() => setScannerOpen(false)}
      />
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
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  scanCardTextWrap: {
    flex: 1,
  },
  scanCardTitle: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  scanCardSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  isbnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  isbnInput: {
    flex: 1,
  },
  lookupButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  lookupButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 14,
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
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 14,
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
