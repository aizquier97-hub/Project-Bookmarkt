// Cover picker (D-028/D-029, amended D-043): the reader searches Google
// Books first - the same source as the search-first add - with Open Library
// as the silent fallback; or fetches the exact edition's cover by typing or
// scanning its ISBN. Candidates load only on demand (one search per tap,
// device-side, cached by expo-image) and attribution is always visible.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { enlargeCoverUrl, searchCovers } from '@/domains/library/bookSearch';
import { lookupBookByIsbn, normalizeIsbn } from '@/domains/library/covers';
import type { CoverCandidate } from '@/domains/library/covers';
import { IsbnScanner, isBarcodeScannerAvailable } from '@/components/IsbnScanner';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

interface CoverPickerProps {
  title: string;
  author: string;
  coverUrl: string | null;
  onChange: (coverUrl: string | null) => void;
  /** Called when the reader picks a search candidate, so forms can fill blanks. */
  onCandidateSelected?: (candidate: CoverCandidate) => void;
  /** Show the ISBN/barcode row (edit screen; add-book has its own). */
  isbnLookup?: boolean;
  /** Called with the normalized ISBN when a lookup resolves, so the form can store it. */
  onIsbnResolved?: (isbn: string) => void;
}

export function CoverPicker({
  title,
  author,
  coverUrl,
  onChange,
  onCandidateSelected,
  isbnLookup = false,
  onIsbnResolved,
}: CoverPickerProps) {
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [isbnField, setIsbnField] = useState('');
  const [isbnBusy, setIsbnBusy] = useState(false);
  const [isbnNote, setIsbnNote] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // The enlarged rendition can 404 for some volumes - fall back to the stored URL.
  const [previewFailed, setPreviewFailed] = useState(false);

  const canSearch = Boolean(title.trim());
  const scannerAvailable = isbnLookup && isBarcodeScannerAvailable();

  const handleSearch = async () => {
    setSearching(true);
    try {
      setCandidates(await searchCovers(title, author));
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  // Exact-edition path: one ISBN lookup returns that printing's own cover.
  const applyIsbn = async (raw: string) => {
    const normalized = normalizeIsbn(raw);
    if (!normalized) {
      setIsbnNote('That does not look like a valid ISBN - check the digits.');
      return;
    }
    setIsbnField(normalized);
    setIsbnBusy(true);
    setIsbnNote(null);
    try {
      const found = await lookupBookByIsbn(normalized);
      if (!found) {
        setIsbnNote('No match for that ISBN.');
        return;
      }
      onIsbnResolved?.(normalized);
      if (found.coverUrl) {
        onChange(found.coverUrl);
        setIsbnNote(`Found the cover for "${found.title}".`);
      } else {
        setIsbnNote(`Found "${found.title}", but it has no cover on file - try Find covers.`);
      }
    } catch {
      setIsbnNote('The lookup timed out - try again in a moment.');
    } finally {
      setIsbnBusy(false);
    }
  };

  const handleScanned = (digits: string) => {
    setScannerOpen(false);
    void applyIsbn(digits);
  };

  return (
    <View>
      <Text style={styles.label}>Cover</Text>

      {coverUrl ? (
        <View style={styles.currentRow}>
          <Pressable
            onPress={() => {
              setPreviewFailed(false);
              setPreviewOpen(true);
            }}
            accessibilityRole="imagebutton"
            accessibilityLabel="View the selected cover larger"
          >
            <Image
              source={{ uri: coverUrl }}
              style={styles.currentCover}
              contentFit="cover"
              accessibilityLabel="Selected book cover"
            />
          </Pressable>
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove this cover"
          >
            <Text style={styles.removeText}>Remove cover</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.noneText}>
          No cover selected - the shelf shows a painted cloth cover instead.
        </Text>
      )}

      {isbnLookup ? (
        <View style={styles.isbnBlock}>
          <View style={styles.isbnRow}>
            {scannerAvailable ? (
              <Pressable
                style={styles.scanButton}
                onPress={() => setScannerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Scan the book's barcode to fetch its exact cover"
              >
                <Ionicons name="barcode-outline" size={20} color={colors.accent} />
              </Pressable>
            ) : null}
            <TextInput
              style={styles.isbnInput}
              placeholder="ISBN for the exact edition"
              placeholderTextColor={colors.muted}
              value={isbnField}
              onChangeText={setIsbnField}
              keyboardType="number-pad"
            />
            <Pressable
              style={styles.lookupButton}
              onPress={() => void applyIsbn(isbnField)}
              disabled={isbnBusy || !isbnField.trim()}
              accessibilityRole="button"
              accessibilityLabel="Look up this ISBN"
            >
              {isbnBusy ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.lookupButtonText}>Look up</Text>
              )}
            </Pressable>
          </View>
          {isbnNote ? <Text style={styles.isbnNote}>{isbnNote}</Text> : null}
        </View>
      ) : null}

      <Pressable
        style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
        onPress={() => void handleSearch()}
        disabled={!canSearch || searching}
        accessibilityRole="button"
        accessibilityLabel="Find covers for this title"
      >
        {searching ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Ionicons name="search-outline" size={15} color={colors.accent} />
            <Text style={styles.searchButtonText}>
              {canSearch ? 'Find covers' : 'Enter a title to find covers'}
            </Text>
          </>
        )}
      </Pressable>

      {searched && !searching ? (
        candidates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
            {candidates.map((candidate) => {
              const selected = candidate.coverUrl === coverUrl;
              return (
                <Pressable
                  key={candidate.coverUrl}
                  onPress={() => {
                    onChange(candidate.coverUrl);
                    onCandidateSelected?.(candidate);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use the cover for ${candidate.title}${
                    candidate.author ? ` by ${candidate.author}` : ''
                  }`}
                >
                  <Image
                    source={{ uri: candidate.previewUrl }}
                    style={[styles.candidate, selected && styles.candidateSelected]}
                    contentFit="cover"
                  />
                  {candidate.year ? (
                    <Text style={styles.candidateYear}>{candidate.year}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.noneText}>
            No covers found - the painted cover keeps the shelf looking whole.
          </Text>
        )
      ) : null}

      <Text style={styles.attribution}>Covers from Google Books and Open Library</Text>

      {coverUrl ? (
        <Modal
          visible={previewOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewOpen(false)}
        >
          <Pressable
            style={styles.previewBackdrop}
            onPress={() => setPreviewOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close the cover preview"
          >
            <Image
              source={{ uri: previewFailed ? coverUrl : enlargeCoverUrl(coverUrl) }}
              style={styles.previewImage}
              contentFit="contain"
              onError={() => setPreviewFailed(true)}
              accessibilityLabel="Enlarged book cover"
            />
            <Text style={styles.previewHint}>Tap anywhere to close</Text>
          </Pressable>
        </Modal>
      ) : null}

      {isbnLookup ? (
        <IsbnScanner
          visible={scannerOpen}
          onScanned={handleScanned}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  currentCover: {
    width: 84,
    height: 124,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  removeText: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  noneText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  isbnBlock: {
    marginBottom: 10,
  },
  isbnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  isbnInput: {
    fontFamily: fonts.serif,
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  lookupButton: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    ...buttonShadow,
  },
  lookupButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 13,
  },
  isbnNote: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  row: {
    marginTop: 12,
  },
  candidate: {
    width: 72,
    height: 104,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  candidateSelected: {
    borderColor: gold.base,
  },
  candidateYear: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
  },
  attribution: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    marginTop: 10,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewImage: {
    width: '92%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
  },
  previewHint: {
    fontFamily: fonts.serif,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    marginTop: 16,
  },
});
