import { Platform } from 'react-native';

// Stage 3 design system (D-040): a clean, warm-neutral palette in the flat,
// cover-first style of StoryGraph / Goodreads / Fable / Kindle. Paper-white
// surfaces, warm ink text, one terracotta accent. Book covers supply the
// color; the chrome stays quiet. All text tokens pass WCAG AA (4.5:1) on
// their intended surfaces.
export const colors = {
  background: '#faf7f2',
  card: '#ffffff',
  border: '#e7dfd3',
  text: '#28221a',
  muted: '#756958',
  accent: '#a1471f',
  accentSoft: '#f6e7dc',
  danger: '#b0342b',
} as const;

// Gold is reserved for celebration and premium markers only: the finished
// checkmark badge, the premium lock, the selected-cover ring. Never used
// for general chrome (the amber-star pattern Goodreads/StoryGraph use).
export const gold = {
  base: '#c9962f',
  deep: '#8a660f',
  glow: 'rgba(201, 150, 47, 0.28)',
  glowSoft: 'rgba(201, 150, 47, 0.12)',
} as const;

// Serif for book titles and screen headers keeps the literary identity
// (Fable/Goodreads use serif display type); everything else is system sans.
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
} as const;

// Flat placeholder-cover hues for books without cover art, the colored-cover
// fallback StoryGraph renders. Mid-dark so white title text stays readable.
const spineColors = ['#7d4032', '#4f5d43', '#3f4a63', '#a3762a', '#5d4260', '#8a4a21'] as const;

export function spineColorFor(id: number): string {
  return spineColors[Math.abs(id) % spineColors.length];
}

// One quiet elevation for cards; elevation covers Android, shadow* iOS.
export const cardShadow = {
  elevation: 1,
  shadowColor: '#3a3125',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
} as const;
