import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  claimBookmark,
  getBookmarkByCode,
  linkBookmark,
  normalizeBookmarkCode,
  recordBookmarkScan,
  registerBookmark,
  type Bookmark,
} from '@/domains/bookmarks/service';
import { listBooks } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold, spineColorFor } from '@/lib/theme';

export default function BookmarkScanScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const code = normalizeBookmarkCode(String(params.code ?? ''));
  const queryClient = useQueryClient();
  const router = useRouter();

  const bookmarkQuery = useQuery({
    queryKey: queryKeys.bookmark(code),
    queryFn: () => getBookmarkByCode(code),
    enabled: code.length > 0,
  });

  const bookmark = bookmarkQuery.data ?? null;
  const linkedTopicId = bookmark?.topic_id ?? null;
  const bookmarkId = bookmark?.id ?? null;

  // A linked bookmark is the fast path: audit the scan and open the book.
  useEffect(() => {
    if (bookmarkId !== null && linkedTopicId !== null) {
      recordBookmarkScan(bookmarkId, linkedTopicId);
      router.replace({ pathname: '/book/[id]', params: { id: String(linkedTopicId) } });
    }
  }, [bookmarkId, linkedTopicId, router]);

  const claimMutation = useMutation({
    mutationFn: (id: string) => claimBookmark(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmark(code) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks });
    },
  });

  const registerMutation = useMutation({
    mutationFn: () => registerBookmark(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmark(code) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks });
    },
  });

  if (!code) {
    return (
      <Screen>
        <Text style={styles.error}>This bookmark link is missing its code.</Text>
      </Screen>
    );
  }

  if (bookmarkQuery.isPending) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.hint}>Reading your bookmark...</Text>
      </Screen>
    );
  }

  if (bookmarkQuery.isError) {
    return (
      <Screen>
        <Text style={styles.error}>
          {bookmarkQuery.error instanceof Error
            ? bookmarkQuery.error.message
            : 'Could not look up this bookmark.'}
        </Text>
      </Screen>
    );
  }

  if (!bookmark) {
    return (
      <Screen>
        <Text style={styles.code}>{code}</Text>
        <Text style={styles.hint}>
          This bookmark is not registered to your account yet. Add it to start linking it to your
          books.
        </Text>
        {registerMutation.isError ? (
          <Text style={styles.error}>
            {registerMutation.error instanceof Error
              ? registerMutation.error.message
              : 'Could not register this bookmark.'}
          </Text>
        ) : null}
        <Pressable
          style={styles.primaryButton}
          onPress={() => registerMutation.mutate()}
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Add this bookmark to my account</Text>
          )}
        </Pressable>
      </Screen>
    );
  }

  if (bookmark.user_id === null) {
    return (
      <Screen>
        <Text style={styles.code}>{bookmark.code}</Text>
        <Text style={styles.hint}>This bookmark has not been claimed yet. Make it yours.</Text>
        {claimMutation.isError ? (
          <Text style={styles.error}>
            {claimMutation.error instanceof Error
              ? claimMutation.error.message
              : 'Could not claim this bookmark.'}
          </Text>
        ) : null}
        <Pressable
          style={styles.primaryButton}
          onPress={() => claimMutation.mutate(bookmark.id)}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Claim this bookmark</Text>
          )}
        </Pressable>
      </Screen>
    );
  }

  if (linkedTopicId !== null) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.hint}>Opening your book...</Text>
      </Screen>
    );
  }

  return <LinkBookmarkFlow bookmark={bookmark} />;
}

function LinkBookmarkFlow({ bookmark }: { bookmark: Bookmark }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  // Edge-to-edge Android: keep the last book row above the system buttons.
  const insets = useSafeAreaInsets();

  const linkMutation = useMutation({
    mutationFn: (topicId: number) => linkBookmark(bookmark.id, topicId),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmark(bookmark.code) });
      if (updated.topic_id !== null) {
        router.replace({ pathname: '/book/[id]', params: { id: String(updated.topic_id) } });
      }
    },
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Link your bookmark' }} />
      <Text style={styles.code}>{bookmark.code}</Text>
      <Text style={styles.hint}>
        This bookmark is not linked to a book right now. Choose the book you are reading with it —
        you can relink it any time.
      </Text>
      {linkMutation.isError ? (
        <Text style={styles.error}>
          {linkMutation.error instanceof Error
            ? linkMutation.error.message
            : 'Could not link this bookmark.'}
        </Text>
      ) : null}
      {booksQuery.isPending ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : booksQuery.isError ? (
        <Text style={styles.error}>Could not load your library.</Text>
      ) : booksQuery.data.length === 0 ? (
        <Text style={styles.hint}>Your shelf is empty — add a book first, then scan again.</Text>
      ) : (
        <FlatList
          data={booksQuery.data}
          keyExtractor={(book) => String(book.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          renderItem={({ item }) => (
            <Pressable
              style={styles.bookRow}
              onPress={() => linkMutation.mutate(item.id)}
              disabled={linkMutation.isPending}
            >
              <View style={[styles.bookStripe, { backgroundColor: spineColorFor(item.id) }]} />
              <View style={styles.bookRowBody}>
                <Text style={styles.bookTitle}>{item.name}</Text>
                {item.author ? <Text style={styles.bookAuthor}>{item.author}</Text> : null}
              </View>
              <Text style={styles.linkAction}>{linkMutation.isPending ? '...' : 'Link'}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      <Stack.Screen options={{ title: 'Your bookmark' }} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  code: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 8,
  },
  hint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 8,
  },
  loader: {
    marginTop: 24,
  },
  primaryButton: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'stretch',
    ...buttonShadow,
  },
  primaryButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 15,
  },
  list: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 32,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    ...cardShadow,
  },
  bookStripe: {
    width: 8,
    alignSelf: 'stretch',
  },
  bookRowBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bookTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  bookAuthor: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    marginTop: 2,
  },
  linkAction: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
    paddingHorizontal: 14,
  },
});
