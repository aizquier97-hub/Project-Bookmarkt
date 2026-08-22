import { Platform } from 'react-native';

// Shared visual constants. Stage 3 owns the real design system; this is a
// warm "paper and leather" palette suited to a reading companion.
export const colors = {
  background: '#f6efe0',
  card: '#fffdf6',
  border: '#e0d2b5',
  text: '#33291b',
  muted: '#84735a',
  accent: '#8a4a21',
  accentSoft: '#f0e2cf',
  danger: '#a83c33',
} as const;

// Wood tones for the bookcase chrome on the library screen.
export const wood = {
  back: '#e6d3ae',
  rail: '#9a7040',
  boardTop: '#b98a5a',
  boardFront: '#7c5a33',
} as const;

// Gold celebrates: the spotlight on the freshest book and finished books.
export const gold = {
  base: '#c1912e',
  deep: '#9c731f',
  glow: 'rgba(212, 165, 50, 0.32)',
  glowSoft: 'rgba(212, 165, 50, 0.14)',
} as const;

// Page-block tones for the 2.5D book covers.
export const paper = {
  edge: '#f7efdc',
  edgeLine: 'rgba(109, 85, 47, 0.35)',
} as const;

// System serif keeps the literary feel without bundling font assets yet.
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
} as const;

// Book-spine hues cycled across the library shelf.
const spineColors = ['#7d4032', '#4f5d43', '#3f4a63', '#a3762a', '#5d4260', '#8a4a21'] as const;

export function spineColorFor(id: number): string {
  return spineColors[Math.abs(id) % spineColors.length];
}

// Soft paper-on-wood depth; elevation covers Android, shadow* covers iOS.
export const cardShadow = {
  elevation: 2,
  shadowColor: '#6d552f',
  shadowOpacity: 0.18,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
} as const;
