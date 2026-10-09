import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BookHeroCompact } from '@/components/book/BookHeroCompact';
import { PhotoCard } from '@/components/book/PhotoCard';
import { bookSectionStyles as shared } from '@/components/book/shared';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, StickyFooter } from '@/components/ui';
import { listEntries } from '@/domains/entries/service';
import { listBookImages } from '@/domains/library/images';
import { getBook } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * The book's photos on their own screen (D-093): visual bookmarks as cards,
 * private to the account. "Choose photos" opens /add-photo, where one image
 * is picked and titled before it is saved.
 */
export default function BookPhotosScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const router = useRouter();

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });
  const imagesQuery = useQuery({
    queryKey: queryKeys.bookImages(bookId),
    queryFn: () => listBookImages(bookId),
    enabled: validId,
  });
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const images = imagesQuery.data ?? [];

  const screenOptions = <Stack.Screen options={{ title: 'Photos', headerBackTitle: 'Book' }} />;

  if (!validId) {
    return (
      <View style={[shared.flex, styles.invalid]}>
        {screenOptions}
        <Text style={shared.error}>This book link is not valid.</Text>
      </View>
    );
  }

  return (
    <View style={shared.flex}>
      {screenOptions}
      <BookHeroCompact book={bookQuery.data} entries={entries} />
      <FlatList
        data={images}
        keyExtractor={(image) => String(image.id)}
        contentContainerStyle={shared.list}
        ListHeaderComponent={
          <View>
            <View style={shared.sectionTitleRow}>
              <Text style={shared.sectionTitle} accessibilityRole="header">
                Your photos
              </Text>
            </View>
            <View style={shared.sectionMetaRow}>
              <Ionicons name="lock-closed-outline" size={13} color={colors.muted} />
              <Text style={styles.privacy}>Photos stay private to your account.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          imagesQuery.isPending ? (
            <LoadingState label="Loading photos…" />
          ) : imagesQuery.isError ? (
            <ErrorState
              error={imagesQuery.error}
              fallback="Could not load photos."
              onRetry={() => void imagesQuery.refetch()}
            />
          ) : (
            <EmptyState message="No photos yet. Keep covers, favorite passages, or margin notes with this book." />
          )
        }
        renderItem={({ item }) => <PhotoCard image={item} bookId={bookId} />}
      />
      <StickyFooter>
        <Button
          label="Choose photos"
          icon="images-outline"
          onPress={() => router.push({ pathname: '/add-photo', params: { id: String(bookId) } })}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  invalid: { padding: spacing.lg },
  privacy: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
});
