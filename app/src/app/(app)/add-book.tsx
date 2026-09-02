import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

import { lookupBookByIsbn, normalizeIsbn, type CoverCandidate } from '@/domains/library/covers';
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
  totalPages: string;
  coverUrl: string | null;
  isbn: string | null;
}): Promise<Book> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Book title is required.');
  }
  // Manual fields win, Open Library fills missing pages. Publisher/year
  // are deliberately not collected (owner, D-032): the book record needs
  // title, author, and pages - nothing a reader has to look up.
  const metadata = await resolveBookMetadata({
    title: name,
    author: input.author,
    manualPublisher: '',
    manualPublicationYear: '',
    manualTotalPages: input.totalPages,
  });
  return addBook({
    name,
    author: input.author,
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
        hasMetadata: Boolean(metadata.totalPages),
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
  const [totalPages, setTotalPages] = useState('');
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

  // One scan fills what the reader has not already typed: title, author,
  // total pages, and the cover (publisher/year intentionally not kept).
  const applyIsbn = async (raw: string) => {
    const normalized = normalizeIsbn(raw);
    if (!normalized) {
      setError('That does not look like a valid ISBN - check the digits.');
      return;
    }
    setError(null);
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

  // Picking a cover also fills blank details from the matched edition -
  // same fill-blanks contract as the scan, with a one-tap Undo (D-033).
  const handleCoverCandidate = (candidate: CoverCandidate) => {
    const fillAuthor = !author.trim() && candidate.author ? candidate.author : null;
    const fillPages =
      !totalPages.trim() && candidate.pagesMedian !== null ? String(candidate.pagesMedian) : null;
    if (!fillAuthor && !fillPages) {
      return;
    }
    const prevAuthor = author;
    const prevPages = totalPages;
    if (fillAuthor) setAuthor(fillAuthor);
    if (fillPages) setTotalPages(fillPages);
    const message =
      fillAuthor && fillPages
        ? 'Author and pages filled from the cover match - pages vary by edition.'
        : fillAuthor
          ? 'Author filled from the cover match.'
          : 'Pages filled from the cover match - pages vary by edition.';
    showToast(message, 'info', {
      label: 'Undo',
      onPress: () => {
        if (fillAuthor) setAuthor(prevAuthor);
        if (fillPages) setTotalPages(prevPages);
      },
    });
  };

  const handleSave = () => {
    setError(null);
    addBookMutation.mutate({
      name,
      author,
      totalPages,
      coverUrl,
      isbn: storedIsbn,
    });
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
        <Stack.Screen options={{ title: 'Add a book' }} />

        {/* Scan-first, no typed-ISBN field (owner call, D-031): one scan
            fills everything; the manual fields below are the fallback. */}
        {scannerAvailable ? (
          <Pressable
            style={styles.scanCard}
            onPress={() => setScannerOpen(true)}
            disabled={lookupBusy}
            accessibilityRole="button"
            accessibilityLabel="Scan the book's barcode"
          >
            {lookupBusy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name="barcode-outline" size={30} color={colors.accent} />
            )}
            <View style={styles.scanCardTextWrap}>
              <Text style={styles.scanCardTitle}>
                {lookupBusy ? 'Looking up your book…' : 'Scan the barcode'}
              </Text>
              <Text style={styles.scanCardSub}>
                Point at the back cover - title, author, and cover fill in for you.
              </Text>
            </View>
          </Pressable>
        ) : null}

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
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>
          Leave pages blank and we will try to fill them from Open Library.
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
