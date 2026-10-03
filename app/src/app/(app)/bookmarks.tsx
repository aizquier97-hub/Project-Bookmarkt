import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  linkBookmark,
  listBookmarks,
  registerBookmark,
  removeBookmark,
  unlinkBookmark,
  type BookmarkWithBook,
} from '@/domains/bookmarks/service';
import { listBooks } from '@/domains/library/service';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold, spineColorFor } from '@/lib/theme';

export default function BookmarksScreen() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const bookmarksQuery = useQuery({ queryKey: queryKeys.bookmarks, queryFn: listBookmarks });

  const registerMutation = useMutation({
    mutationFn: () => registerBookmark(),
    onSuccess: () => {
      showToast('Bookmark registered. Show its QR code to print or share it.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks });
    },
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'My bookmarks' }} />
      <Text style={styles.lede}>
        Each bookmark carries a QR code. Scan it to jump straight to the book it is linked to —
        and relink it whenever you start a new book.
      </Text>
      {registerMutation.isError ? (
        <Text style={styles.error}>
          {registerMutation.error instanceof Error
            ? registerMutation.error.message
            : 'Could not register a bookmark.'}
        </Text>
      ) : null}
      <Pressable
        style={styles.registerButton}
        onPress={() => registerMutation.mutate()}
        disabled={registerMutation.isPending}
      >
        {registerMutation.isPending ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.registerButtonText}>+ Register a new bookmark</Text>
        )}
      </Pressable>
      {bookmarksQuery.isPending ? (
        <LoadingState label="Loading bookmarks…" />
      ) : bookmarksQuery.isError ? (
        <ErrorState
          error={bookmarksQuery.error}
          fallback="Could not load your bookmarks."
          onRetry={() => void bookmarksQuery.refetch()}
        />
      ) : bookmarksQuery.data.length === 0 ? (
        <EmptyState message="No bookmarks yet. Register one to get its QR code, then print it or keep it on screen." />
      ) : (
        <FlatList
          data={bookmarksQuery.data}
          keyExtractor={(bookmark) => bookmark.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <BookmarkCard bookmark={item} />}
        />
      )}
    </View>
  );
}

function BookmarkCard({ bookmark }: { bookmark: BookmarkWithBook }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [showQr, setShowQr] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const booksQuery = useQuery({
    queryKey: queryKeys.books,
    queryFn: listBooks,
    enabled: showPicker,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks });
  };

  const linkMutation = useMutation({
    mutationFn: (topicId: number) => linkBookmark(bookmark.id, topicId),
    onSuccess: () => {
      setShowPicker(false);
      showToast('Bookmark linked.', 'success');
      invalidate();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => unlinkBookmark(bookmark.id),
    onSuccess: () => {
      showToast('Bookmark unlinked.', 'success');
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => removeBookmark(bookmark.id),
    onSuccess: () => {
      showToast('Bookmark removed.', 'success');
      invalidate();
    },
  });

  const scanUrl = Linking.createURL(`/bookmark/${bookmark.code}`);
  const linkedBook = bookmark.topics;
  const busy = linkMutation.isPending || unlinkMutation.isPending || removeMutation.isPending;

  const confirmRemove = () => {
    Alert.alert(
      'Remove bookmark',
      `Remove ${bookmark.code} from your account? Its QR code will stop working until someone registers it again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate() },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCode}>{bookmark.code}</Text>
        {linkedBook ? (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/book/[id]', params: { id: String(linkedBook.id) } })
            }
          >
            <Text style={styles.cardLinked}>{linkedBook.name}</Text>
          </Pressable>
        ) : (
          <Text style={styles.cardUnlinked}>Not linked to a book</Text>
        )}
      </View>

      {linkMutation.isError ? (
        <Text style={styles.error}>
          {linkMutation.error instanceof Error
            ? linkMutation.error.message
            : 'Could not link this bookmark.'}
        </Text>
      ) : null}
      {unlinkMutation.isError ? <Text style={styles.error}>Could not unlink.</Text> : null}
      {removeMutation.isError ? <Text style={styles.error}>Could not remove.</Text> : null}

      <View style={styles.cardActions}>
        <Pressable style={styles.actionButton} onPress={() => setShowQr((value) => !value)}>
          <Text style={styles.actionText}>{showQr ? 'Hide QR' : 'Show QR'}</Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => setShowPicker((value) => !value)}
          disabled={busy}
        >
          <Text style={styles.actionText}>{linkedBook ? 'Relink' : 'Link a book'}</Text>
        </Pressable>
        {linkedBook ? (
          <Pressable
            style={styles.actionButton}
            onPress={() => unlinkMutation.mutate()}
            disabled={busy}
          >
            <Text style={styles.actionText}>Unlink</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.actionButton} onPress={confirmRemove} disabled={busy}>
          <Text style={styles.actionDangerText}>Remove</Text>
        </Pressable>
      </View>

      {showQr ? (
        <View style={styles.qrBox}>
          <QRCode value={scanUrl} size={180} backgroundColor={colors.card} color={colors.text} />
          <Text style={styles.qrHint}>{scanUrl}</Text>
          <Text style={styles.qrNote}>
            Scan with your phone camera to open this bookmark. During development the code points
            at the Expo dev server.
          </Text>
        </View>
      ) : null}

      {showPicker ? (
        booksQuery.isPending ? (
          <ActivityIndicator color={colors.accent} style={styles.pickerLoader} />
        ) : booksQuery.isError ? (
          <Text style={styles.error}>Could not load your library.</Text>
        ) : booksQuery.data.length === 0 ? (
          <Text style={styles.empty}>Your shelf is empty — add a book first.</Text>
        ) : (
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Link to which book?</Text>
            {booksQuery.data.map((book) => (
              <Pressable
                key={book.id}
                style={styles.pickerRow}
                onPress={() => linkMutation.mutate(book.id)}
                disabled={busy}
              >
                <View
                  style={[styles.pickerStripe, { backgroundColor: spineColorFor(book.id) }]}
                />
                <View style={styles.pickerRowBody}>
                  <Text style={styles.pickerBookTitle}>{book.name}</Text>
                  {book.author ? (
                    <Text style={styles.pickerBookAuthor}>{book.author}</Text>
                  ) : null}
                </View>
                <Text style={styles.pickerAction}>
                  {linkMutation.isPending ? '...' : 'Link'}
                </Text>
              </Pressable>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  lede: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  registerButton: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
    ...buttonShadow,
  },
  registerButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 15,
  },
  loader: {
    marginTop: 24,
  },
  empty: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 16,
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    marginTop: 6,
    marginBottom: 4,
  },
  list: {
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    ...cardShadow,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardCode: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardLinked: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    marginTop: 3,
  },
  cardUnlinked: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 3,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  actionText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  actionDangerText: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  qrBox: {
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
  },
  qrHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  qrNote: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  pickerLoader: {
    marginTop: 12,
  },
  picker: {
    marginTop: 12,
    paddingTop: 12,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
  },
  pickerTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pickerStripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  pickerRowBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pickerBookTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  pickerBookAuthor: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    marginTop: 1,
  },
  pickerAction: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
    paddingHorizontal: 12,
  },
});
