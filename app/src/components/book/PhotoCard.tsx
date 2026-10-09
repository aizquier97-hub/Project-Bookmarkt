import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookSectionStyles as shared, confirmDestructive, formatRecordTimestamp } from '@/components/book/shared';
import { deleteBookImage, updateBookImageCaption, type BookImage } from '@/domains/library/images';
import { composePhotoCaption, parsePhotoCaption } from '@/domains/library/photoCaption';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

/**
 * One photo card (D-093, after the Figma "Book · Photos" screen): the image,
 * a serif title with its description beneath, the timestamp, then a
 * hairline and "Edit caption ✎" / "Delete". Title and description share the
 * one caption column (see photoCaption.ts).
 */
export function PhotoCard({ image, bookId }: { image: BookImage; bookId: number }) {
  const queryClient = useQueryClient();
  const parsed = parsePhotoCaption(image.caption);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(parsed.title);
  const [description, setDescription] = useState(parsed.description);
  const [cardError, setCardError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookImages(bookId) });
  };

  const captionMutation = useMutation({
    mutationFn: () =>
      updateBookImageCaption(image.id, bookId, composePhotoCaption({ title, description })),
    onSuccess: () => {
      setEditing(false);
      setCardError(null);
      invalidate();
    },
    onError: (err) => {
      setCardError(err instanceof Error ? err.message : 'Could not save the caption.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBookImage(image),
    onSuccess: invalidate,
    onError: (err) => {
      setCardError(err instanceof Error ? err.message : 'Could not delete the photo.');
    },
  });

  return (
    <View style={styles.card}>
      {image.signed_url ? (
        <Image
          source={{ uri: image.signed_url }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={parsed.title || 'Photo'}
        />
      ) : (
        <View style={[styles.image, styles.imageMissing]}>
          <Text style={styles.missingText}>Image unavailable</Text>
        </View>
      )}
      <View style={styles.body}>
        {editing ? (
          <>
            <TextInput
              style={shared.input}
              placeholder="Title"
              placeholderTextColor={colors.muted}
              value={title}
              onChangeText={setTitle}
              autoFocus
              accessibilityLabel="Photo title"
            />
            <TextInput
              style={[shared.input, shared.stackedInput, shared.textAreaSmall]}
              placeholder="Description"
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              accessibilityLabel="Photo description"
            />
            {cardError ? <Text style={shared.error}>{cardError}</Text> : null}
            <View style={shared.cardActions}>
              <Pressable
                style={shared.smallButton}
                onPress={() => captionMutation.mutate()}
                disabled={captionMutation.isPending}
                accessibilityRole="button"
              >
                <Text style={shared.smallButtonText}>
                  {captionMutation.isPending ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
              <Pressable
                style={shared.smallButtonGhost}
                onPress={() => {
                  setEditing(false);
                  setTitle(parsed.title);
                  setDescription(parsed.description);
                  setCardError(null);
                }}
                accessibilityRole="button"
              >
                <Text style={shared.smallButtonGhostText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {parsed.title ? <Text style={styles.title}>{parsed.title}</Text> : null}
            {parsed.description ? (
              <Text style={[shared.cardText, styles.description]}>{parsed.description}</Text>
            ) : null}
            <Text style={[shared.cardDate, !parsed.title && styles.dateOnly]}>
              {formatRecordTimestamp(image)}
            </Text>
            {cardError ? <Text style={shared.error}>{cardError}</Text> : null}
            <View style={shared.cardDivider} />
            <View style={shared.cardFooter}>
              <Pressable
                style={[shared.textAction, styles.editRow]}
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel={parsed.title ? 'Edit caption' : 'Add caption'}
              >
                <Text style={shared.textActionLabel}>
                  {parsed.title || parsed.description ? 'Edit caption' : 'Add caption'}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={colors.accent} />
              </Pressable>
              <Pressable
                style={shared.textAction}
                onPress={() =>
                  confirmDestructive('Delete photo', 'Delete this image?', () => deleteMutation.mutate())
                }
                disabled={deleteMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Delete photo"
              >
                <Text style={shared.textActionMuted}>
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    overflow: 'hidden',
    ...cardShadow,
  },
  image: { width: '100%', height: 210, backgroundColor: colors.surface2 },
  imageMissing: { alignItems: 'center', justifyContent: 'center' },
  missingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14 },
  body: { padding: spacing.md },
  title: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.text },
  description: { marginTop: 4 },
  dateOnly: { marginTop: 0 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
