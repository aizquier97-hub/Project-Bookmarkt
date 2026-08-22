// Cover picker (D-028): the reader searches Open Library and chooses the
// cover - or keeps the painted cloth cover. Candidates load only on demand
// (one search per tap, device-side, cached by expo-image) and attribution
// is always visible, per Open Library's moderate-use guidance.

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { searchCoverCandidates, type CoverCandidate } from '@/domains/library/covers';
import { colors, gold } from '@/lib/theme';

interface CoverPickerProps {
  title: string;
  author: string;
  coverUrl: string | null;
  onChange: (coverUrl: string | null) => void;
}

export function CoverPicker({ title, author, coverUrl, onChange }: CoverPickerProps) {
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const canSearch = Boolean(title.trim());

  const handleSearch = async () => {
    setSearching(true);
    try {
      setCandidates(await searchCoverCandidates(title, author));
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  return (
    <View>
      <Text style={styles.label}>Cover</Text>

      {coverUrl ? (
        <View style={styles.currentRow}>
          <Image
            source={{ uri: coverUrl }}
            style={styles.currentCover}
            contentFit="cover"
            accessibilityLabel="Selected book cover"
          />
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
                  key={candidate.coverId}
                  onPress={() => onChange(candidate.coverUrl)}
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

      <Text style={styles.attribution}>Covers from Open Library</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
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
    color: colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  noneText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
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
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 3,
  },
  attribution: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 10,
  },
});
