import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cleanupTranscript } from '@/domains/voice/cleanup';
import type { useDictation } from '@/domains/voice/useDictation';
import { colors, fonts } from '@/lib/theme';

/**
 * The dictation controls (D-016) as a drop-in block under any text field:
 * a "speak" button when idle, live partials while recording, and the
 * verbatim-review card before anything is committed. The caller owns the
 * hook so it can react to status (e.g. auto-start on "Speak").
 */
export function DictationPanel({
  dictation,
  startLabel = 'Add by voice',
  listeningLabel = 'Listening… speak your note.',
  confirmLabel = 'Add to note',
  onConfirm,
}: {
  dictation: ReturnType<typeof useDictation>;
  startLabel?: string;
  listeningLabel?: string;
  confirmLabel?: string;
  /** Receives the verbatim transcript and the lightly cleaned version. */
  onConfirm: (raw: string, cleaned: string) => void;
}) {
  if (dictation.status === 'unavailable') {
    return null;
  }
  return (
    <View>
      {dictation.status === 'idle' ? (
        <Pressable
          style={styles.dictateButton}
          onPress={() => void dictation.start()}
          accessibilityRole="button"
          accessibilityLabel={startLabel}
        >
          <Ionicons name="mic" size={15} color={colors.text} />
          <Text style={styles.dictateButtonText}>{startLabel}</Text>
        </Pressable>
      ) : null}

      {dictation.status === 'recording' ? (
        <View style={styles.card}>
          <Text style={styles.label}>{listeningLabel}</Text>
          {dictation.partial ? <Text style={styles.partial}>{dictation.partial}</Text> : null}
          <Pressable
            style={styles.stopButton}
            onPress={dictation.stop}
            accessibilityRole="button"
            accessibilityLabel="Stop dictation"
          >
            <Ionicons name="stop" size={14} color={colors.danger} />
            <Text style={styles.stopButtonText}>Stop dictation</Text>
          </Pressable>
        </View>
      ) : null}

      {dictation.status === 'review' ? (
        <View style={styles.card}>
          <Text style={styles.label}>Review your dictation</Text>
          <Text style={styles.preview}>{cleanupTranscript(dictation.raw)}</Text>
          <Text style={styles.rawNote}>Raw transcript: “{dictation.raw}”</Text>
          <Text style={styles.hint}>
            Only punctuation and capitalization were adjusted — your words are untouched. The raw
            transcript is kept with your entry.
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.smallButton}
              onPress={() => {
                const raw = dictation.confirm();
                if (!raw) {
                  return;
                }
                onConfirm(raw, cleanupTranscript(raw));
              }}
              accessibilityRole="button"
            >
              <Text style={styles.smallButtonText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonGhost}
              onPress={dictation.discard}
              accessibilityRole="button"
            >
              <Text style={styles.smallButtonGhostText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dictateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
  },
  dictateButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    color: colors.muted,
    fontSize: 13,
  },
  partial: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  preview: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  rawNote: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  hint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stopButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.danger,
    fontSize: 13,
  },
  smallButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.background,
    fontSize: 13,
  },
  smallButtonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonGhostText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.muted,
    fontSize: 13,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 13,
    marginTop: 8,
  },
});
