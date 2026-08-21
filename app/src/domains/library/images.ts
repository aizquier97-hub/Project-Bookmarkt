import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { requireUserId } from '@/domains/auth/service';
import {
  BOOK_IMAGES_BUCKET,
  extractStoragePathFromPublicUrl,
} from '@/domains/library/service';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

// PWA parity constants (index.html): private bucket + 1h signed URLs,
// uploads downscaled to 1600px at 0.82 quality.
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_DIMENSION = 1600;
const UPLOAD_QUALITY = 0.82;

export interface BookImage extends Tables<'book_images'> {
  /** Resolved, time-limited display URL (empty when signing failed). */
  signed_url: string;
  storage_path: string | null;
}

export async function listBookImages(bookId: number): Promise<BookImage[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('book_images')
    .select('*')
    .eq('user_id', userId)
    .eq('topic_id', bookId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return attachSignedUrls(data ?? []);
}

/** Mirrors the PWA: rows store storage paths (legacy rows full URLs). */
async function attachSignedUrls(rows: Tables<'book_images'>[]): Promise<BookImage[]> {
  const prepared = rows.map((row) => ({
    row,
    storagePath: extractStoragePathFromPublicUrl(row.image_url),
  }));
  const storagePaths = Array.from(
    new Set(prepared.map((item) => item.storagePath).filter((path): path is string => !!path)),
  );
  if (!storagePaths.length) {
    return prepared.map((item) => ({
      ...item.row,
      storage_path: item.storagePath,
      signed_url: item.storagePath ? '' : item.row.image_url,
    }));
  }
  const signedRes = await supabase.storage
    .from(BOOK_IMAGES_BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (signedRes.error) {
    throw signedRes.error;
  }
  const signedByPath = new Map<string, string>();
  (signedRes.data ?? []).forEach((item, index) => {
    const path = item.path ?? storagePaths[index] ?? '';
    if (path && item.signedUrl) {
      signedByPath.set(path, item.signedUrl);
    }
  });
  return prepared.map((item) => ({
    ...item.row,
    storage_path: item.storagePath,
    signed_url: item.storagePath
      ? (signedByPath.get(item.storagePath) ?? '')
      : item.row.image_url,
  }));
}

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileName?: string | null;
}

export async function uploadBookImage(
  bookId: number,
  asset: PickedImage,
  caption: string,
): Promise<void> {
  const userId = await requireUserId();
  const optimized = await optimizeForUpload(asset);
  const response = await fetch(optimized.uri);
  const body = await response.arrayBuffer();
  const filePath = `${userId}/${bookId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${optimized.extension}`;

  const uploadRes = await supabase.storage
    .from(BOOK_IMAGES_BUCKET)
    .upload(filePath, body, { contentType: optimized.contentType, upsert: false });
  if (uploadRes.error) {
    throw uploadRes.error;
  }

  const insertRes = await supabase.from('book_images').insert({
    user_id: userId,
    topic_id: bookId,
    image_url: filePath,
    caption: caption.trim() || null,
  });
  if (insertRes.error) {
    // Keep storage consistent with the failed metadata insert.
    await supabase.storage.from(BOOK_IMAGES_BUCKET).remove([filePath]);
    throw insertRes.error;
  }
}

async function optimizeForUpload(
  asset: PickedImage,
): Promise<{ uri: string; contentType: string; extension: string }> {
  const largestSide = Math.max(asset.width ?? 0, asset.height ?? 0);
  const needsResize = largestSide > MAX_DIMENSION;
  try {
    const result = await manipulateAsync(
      asset.uri,
      needsResize
        ? [
            asset.width && asset.height && asset.width >= asset.height
              ? { resize: { width: MAX_DIMENSION } }
              : { resize: { height: MAX_DIMENSION } },
          ]
        : [],
      { compress: UPLOAD_QUALITY, format: SaveFormat.JPEG },
    );
    return { uri: result.uri, contentType: 'image/jpeg', extension: 'jpg' };
  } catch {
    // Optimization is best-effort, like the PWA: fall back to the original.
    const extension =
      (asset.fileName ?? asset.uri).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
      'jpg';
    return {
      uri: asset.uri,
      contentType: asset.mimeType ?? 'image/jpeg',
      extension,
    };
  }
}

export async function updateBookImageCaption(
  imageId: number,
  bookId: number,
  caption: string,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('book_images')
    .update({ caption: caption.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', imageId)
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (error) {
    throw error;
  }
}

/** Storage object first, then the row — rows cascade but files do not. */
export async function deleteBookImage(image: BookImage): Promise<void> {
  const userId = await requireUserId();
  const storagePath = image.storage_path ?? extractStoragePathFromPublicUrl(image.image_url);
  if (storagePath) {
    const removeRes = await supabase.storage.from(BOOK_IMAGES_BUCKET).remove([storagePath]);
    if (removeRes.error) {
      throw removeRes.error;
    }
  }
  const { error } = await supabase
    .from('book_images')
    .delete()
    .eq('id', image.id)
    .eq('user_id', userId)
    .eq('topic_id', image.topic_id);
  if (error) {
    throw error;
  }
}
