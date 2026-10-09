import { Alert, StyleSheet } from 'react-native';

import { buttonShadow, cardShadow, colors, fonts, radii } from '@/lib/theme';

// Matches the PWA rule: only flag "(edited)" when updated_at trails created_at
// by more than a second.
export function formatRecordTimestamp(record: {
  created_at: string | null;
  updated_at: string | null;
}) {
  if (!record.created_at) {
    return 'No date';
  }
  const created = new Date(record.created_at);
  if (Number.isNaN(created.getTime())) {
    return 'Invalid date';
  }
  const label = created.toLocaleString();
  if (!record.updated_at) {
    return label;
  }
  const updatedMs = new Date(record.updated_at).getTime();
  const edited = Number.isFinite(updatedMs) && updatedMs - created.getTime() > 1000;
  return edited ? `${label} (edited)` : label;
}

export function confirmDestructive(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/**
 * Styles the book section screens share (D-093): list padding, inputs,
 * the small in-card buttons, and the card frame itself. Each screen adds
 * its own on top.
 */
export const bookSectionStyles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 12,
  },
  // "Your journal" / "Your characters" / "Your photos" with its meta line.
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 40,
    color: colors.text,
  },
  sectionMeta: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  input: {
    fontFamily: fonts.sans,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.field,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  stackedInput: { marginTop: 8 },
  textAreaSmall: { minHeight: 64, textAlignVertical: 'top' },
  searchInput: { marginBottom: 4 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 16,
    ...cardShadow,
  },
  cardFocused: { borderColor: colors.accent, borderWidth: 2 },
  cardText: { fontFamily: fonts.sans, color: colors.text, fontSize: 15, lineHeight: 22 },
  cardDate: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 8 },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: 12,
    marginBottom: 10,
  },
  // Footer of a card: russet text action left, muted text action right.
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textAction: { minHeight: 32, justifyContent: 'center' },
  textActionLabel: { fontFamily: fonts.sansMedium, color: colors.accent, fontSize: 14 },
  textActionMuted: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 14 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonText: { fontFamily: fonts.sansSemiBold, color: colors.onAccent, fontSize: 13 },
  smallButtonGhost: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonGhostText: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 13 },
  error: { fontFamily: fonts.sans, color: colors.danger, marginTop: 8 },
  footerRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  footerPrimary: { flex: 1 },
  footerSquare: { width: 48, paddingHorizontal: 0 },
});
