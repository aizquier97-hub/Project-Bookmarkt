import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookSectionStyles as shared } from '@/components/book/shared';
import { KeyboardPane } from '@/components/KeyboardPane';
import { useToast } from '@/components/toast';
import { Button, SectionLabel, StickyFooter } from '@/components/ui';
import { uploadBookImage } from '@/domains/library/images';
import { composePhotoCaption } from '@/domains/library/photoCaption';
import { getBook } from '@/domains/library/service';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, radii, spacing } from '@/lib/theme';

/**
 * Add one photo to a book (D-093): pick an image, give it a title and an
 * optional description, save. Title and description are packed into the
 * image's single caption column; the photos screen reads them back apart.
 */
export default function AddPhotoScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
  });

  const pickImage = async () => {
    setPickError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (picked.canceled || !picked.assets.length) {
        return;
      }
      setAsset(picked.assets[0]);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open your photos.');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!asset) {
        throw new Error('Choose a photo first.');
      }
      await uploadBookImage(bookId, asset, composePhotoCaption({ title, description }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookImages(bookId) });
      showToast('Photo saved.', 'success');
      router.back();
    },
  });

  const screenOptions = <Stack.Screen options={{ title: 'Add a photo', headerBackTitle: 'Photos' }} />;

  if (!validId) {
    return (
      <View style={[shared.flex, styles.invalid]}>
        {screenOptions}
        <Text style={shared.error}>This book link is not valid.</Text>
      </View>
    );
  }

  return (
    <KeyboardPane style={shared.flex}>
      {screenOptions}
      <ScrollView
        style={shared.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.eyebrow}>
          {[bookQuery.data?.name, 'Your photos'].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.heading} accessibilityRole="header">
          Add a photo
        </Text>

        <Pressable
          style={({ pressed }) => [styles.picker, asset && styles.pickerFilled, pressed && styles.pressed]}
          onPress={() => void pickImage()}
          accessibilityRole="button"
          accessibilityLabel={asset ? 'Change the photo' : 'Choose a photo from your library'}
        >
          {asset ? (
            <>
              <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />
              <View style={styles.changeBadge}>
                <Ionicons name="swap-horizontal-outline" size={14} color={colors.accent} />
                <Text style={styles.changeText}>Change photo</Text>
              </View>
            </>
          ) : (
            <View style={styles.pickerEmpty}>
              <Ionicons name="images-outline" size={28} color={colors.accent} />
              <Text style={styles.pickerTitle}>Choose a photo</Text>
              <Text style={styles.pickerHint}>
                A cover, a favorite passage, a margin note. Photos stay private to your account.
              </Text>
            </View>
          )}
        </Pressable>
        {pickError ? <Text style={shared.error}>{pickError}</Text> : null}

        <SectionLabel style={styles.label}>Title</SectionLabel>
        <TextInput
          style={shared.input}
          placeholder="e.g., Main house living room"
          placeholderTextColor={colors.muted}
          value={title}
          onChangeText={setTitle}
          returnKeyType="next"
          accessibilityLabel="Photo title"
        />
        <SectionLabel style={styles.label}>Description</SectionLabel>
        <TextInput
          style={[shared.input, styles.textArea]}
          placeholder="What this shows, or why you kept it (optional)"
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          scrollEnabled={false}
          accessibilityLabel="Photo description"
        />

        {saveMutation.isError ? (
          <Text style={shared.error}>
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : 'The photo could not be saved. Please try again.'}
          </Text>
        ) : null}
      </ScrollView>
      <StickyFooter>
        <Button
          label="Save photo"
          icon="checkmark"
          onPress={() => saveMutation.mutate()}
          disabled={!asset}
          loading={saveMutation.isPending}
        />
      </StickyFooter>
    </KeyboardPane>
  );
}

const styles = StyleSheet.create({
  invalid: { padding: spacing.lg },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  picker: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    backgroundColor: colors.card,
    overflow: 'hidden',
    minHeight: 180,
  },
  pickerFilled: { borderStyle: 'solid' },
  pressed: { opacity: 0.85 },
  pickerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: 180,
  },
  pickerTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  pickerHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
  },
  preview: { width: '100%', height: 220 },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  changeText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.accent },
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
});
