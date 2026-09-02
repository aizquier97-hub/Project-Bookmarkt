import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import {
  lookupBookSearchByIsbn,
  searchBooks,
  type BookSearchResult,
} from '@/domains/library/bookSearch';
import { normalizeIsbn, type CoverCandidate } from '@/domains/library/covers';
import { resolveBookMetadata } from '@/domains/library/metadata';
import { addBook, type Book } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { CoverPicker } from '@/components/CoverPicker';
import { IsbnScanner, isBarcodeScannerAvailable } from '@/components/IsbnScanner';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { colors } from '@/lib/theme';

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 2;

async function addBookWithLookup(input: {
  name: string;
  author: string;
  totalPages: string;
  coverUrl: string | null;
  isbn: string | null;
  viaSearch: boolean;
}): Promise<Book> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Book title is required.');
  }
  // Manual fields win, the lookup fills missing pages. Publisher/year are
  // deliberately not collected (owner, D-032): the book record needs
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
        viaSearch: input.viaSearch,
      },
      book.id,
    );
    return book;
  });
}

function ResultRow({
  result,
  pending,
  disabled,
  onPress,
}: {
  result: BookSearchResult;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const subParts = [
    result.author,
    result.year ? String(result.year) : null,
    result.pages ? `${result.pages} pages` : null,
  ].filter(Boolean);
  return (
    <Pressable
      style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Add ${result.title}${result.author ? ` by ${result.author}` : ''}`}
    >
      {result.coverUrl ? (
        <Image
          source={{ uri: result.coverUrl }}
          style={styles.resultCover}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.resultCover, styles.resultCoverFallback]}>
          <Ionicons name="book-outline" size={20} color={colors.muted} />
        </View>
      )}
      <View style={styles.resultTextWrap}>
        <Text style={styles.resultTitle} numberOfLines={2}>
          {result.title}
        </Text>
        {subParts.length ? (
          <Text style={styles.resultSub} numberOfLines={1}>
            {subParts.join(' · ')}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Ionicons name="add-circle-outline" size={26} color={colors.accent} />
      )}
    </Pressable>
  );
}

export default function AddBookScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  // Search-first flow (D-042): type or scan, tap a result, done.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingResultId, setPendingResultId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const requestRef = useRef(0);

  // Manual fallback keeps the previous form intact behind a toggle.
  const [manualOpen, setManualOpen] = useState(false);
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [storedIsbn, setStoredIsbn] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const scannerAvailable = isBarcodeScannerAvailable();

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestRef.current;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(() => {
      searchBooks(trimmed).then(
        (found) => {
          if (requestRef.current === requestId) {
            setResults(found);
            setSearching(false);
          }
        },
        () => {
          if (requestRef.current === requestId) {
            setResults([]);
            setSearching(false);
            setSearchError('Search is unreachable right now - try again or add the book manually.');
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const addBookMutation = useMutation({
    mutationFn: addBookWithLookup,
    onSuccess: (book) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      showToast(`Added "${book.name}" to your library.`, 'success');
      router.back();
    },
    onError: (err, variables) => {
      const message = err instanceof Error ? err.message : 'Could not add the book.';
      if (variables.viaSearch) {
        showToast(message, 'error');
      } else {
        setManualError(message);
      }
    },
    onSettled: () => {
      setPendingResultId(null);
    },
  });

  // One tap on a result adds the book - the reader can edit details later.
  const handlePickResult = (result: BookSearchResult) => {
    if (addBookMutation.isPending) {
      return;
    }
    setPendingResultId(result.id);
    addBookMutation.mutate({
      name: result.title,
      author: result.author ?? '',
      totalPages: result.pages ? String(result.pages) : '',
      coverUrl: result.coverUrl,
      isbn: result.isbn13,
      viaSearch: true,
    });
  };

  // A successful scan adds the matched book immediately (scanning the
  // barcode is the intent to add). A miss opens the manual form with the
  // ISBN kept, so nothing the reader did is wasted.
  const applyIsbn = async (raw: string) => {
    const normalized = normalizeIsbn(raw);
    if (!normalized) {
      setSearchError('That does not look like a valid ISBN - check the digits.');
      return;
    }
    setSearchError(null);
    setLookupBusy(true);
    try {
      const found = await lookupBookSearchByIsbn(normalized);
      if (!found) {
        setStoredIsbn(normalized);
        setManualOpen(true);
        setManualError('No match for that barcode - add the details by hand and we keep the ISBN.');
        return;
      }
      handlePickResult(found);
    } catch {
      setSearchError('The lookup timed out - try again or add the book manually.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleScanned = (digits: string) => {
    setScannerOpen(false);
    void applyIsbn(digits);
  };

  const openManual = () => {
    if (!manualOpen && !name.trim() && query.trim() && !normalizeIsbn(query)) {
      setName(query.trim());
    }
    setManualOpen((open) => !open);
  };

  // Picking a cover also fills blank details from the matched edition -
  // same fill-blanks contract as before, with a one-tap Undo (D-033).
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

  const handleManualSave = () => {
    setManualError(null);
    addBookMutation.mutate({
      name,
      author,
      totalPages,
      coverUrl,
      isbn: storedIsbn,
      viaSearch: false,
    });
  };

  const trimmedQuery = query.trim();
  const showEmptyState =
    trimmedQuery.length >= MIN_QUERY_LENGTH && !searching && !results.length && !searchError;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: 'Add a book' }} />

        {/* Search-first (D-042): the fastest path is typing a few letters
            and tapping the match. Scan sits beside it; manual is fallback. */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Title, author, or ISBN"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search for a book to add"
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          {scannerAvailable ? (
            <Pressable
              style={styles.scanButton}
              onPress={() => setScannerOpen(true)}
              disabled={lookupBusy}
              accessibilityRole="button"
              accessibilityLabel="Scan the book's barcode"
            >
              {lookupBusy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Ionicons name="barcode-outline" size={24} color={colors.accent} />
              )}
            </Pressable>
          ) : null}
        </View>

        {trimmedQuery.length < MIN_QUERY_LENGTH && !results.length ? (
          <Text style={styles.hint}>
            Start typing and tap a match to add it - cover, author, and pages come along for free.
          </Text>
        ) : null}

        {searching ? (
          <View style={styles.searchingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.searchingText}>Searching…</Text>
          </View>
        ) : null}

        {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

        {!searching && results.length ? (
          <View style={styles.resultsList}>
            {results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                pending={pendingResultId === result.id}
                disabled={addBookMutation.isPending}
                onPress={() => handlePickResult(result)}
              />
            ))}
          </View>
        ) : null}

        {showEmptyState ? (
          <Text style={styles.hint}>
            No matches. Check the spelling, or add the book manually below.
          </Text>
        ) : null}

        <Pressable
          style={styles.manualToggle}
          onPress={openManual}
          accessibilityRole="button"
          accessibilityLabel={manualOpen ? 'Hide the manual form' : 'Add the book manually'}
        >
          <Text style={styles.manualToggleText}>
            {manualOpen ? 'Hide the manual form' : "Can't find it? Add it manually"}
          </Text>
          <Ionicons
            name={manualOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.accent}
          />
        </Pressable>

        {manualOpen ? (
          <View>
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

            {manualError ? <Text style={styles.error}>{manualError}</Text> : null}

            <Text style={styles.hint}>
              Leave pages blank and we will try to fill them for you.
            </Text>

            <Pressable
              style={styles.saveButton}
              onPress={handleManualSave}
              disabled={addBookMutation.isPending}
            >
              {addBookMutation.isPending && !pendingResultId ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.saveButtonText}>Add book</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.attribution}>
          Search results from Google Books. Covers also from Open Library.
        </Text>

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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    paddingVertical: 12,
    fontSize: 16,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  searchingText: {
    color: colors.muted,
    fontSize: 14,
  },
  resultsList: {
    marginTop: 12,
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  resultRowPressed: {
    opacity: 0.7,
  },
  resultCover: {
    width: 44,
    height: 64,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  resultCoverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextWrap: {
    flex: 1,
  },
  resultTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  resultSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 22,
    paddingVertical: 8,
  },
  manualToggleText: {
    color: colors.accent,
    fontWeight: '600',
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
  attribution: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 26,
    textAlign: 'center',
  },
  footerSpace: {
    height: 40,
  },
});
