import { Platform } from 'react-native';

// Stage 4 tactile redesign (D-054): layered physical materials in place of
// the flat Stage 3 chrome - dark-walnut wood for the app frame, deep
// leather for accents, warm cream paper for reading surfaces. Ink-dark
// text for contrast; gold is bold and reserved for active states, primary
// actions, and celebration. All text tokens pass WCAG AA (4.5:1) on their
// intended surfaces.
export const colors = {
  background: '#f0e6d2',
  card: '#faf4e6',
  border: '#c8b48d',
  text: '#191008',
  muted: '#5a4a38',
  accent: '#7d3417',
  accentSoft: '#eedac6',
  danger: '#9d271f',
  // The wooden frame: headers, tab bar, and other structural chrome.
  walnut: '#2a1c11',
  walnutBorder: '#4a301c',
  onWalnut: '#f2e7ce',
  onWalnutMuted: '#b7a17f',
} as const;

// Gold carries the app's active states and primary highlights (D-054):
// the primary action fill, the active tab tint, selection rings, plus the
// celebration markers it always owned (finished badge, premium lock).
export const gold = {
  base: '#c9962f',
  deep: '#8a660f',
  // Soft gold fill for tactile primary buttons; ink-on-gold text passes AA.
  fill: '#dcae45',
  onFill: '#2a1c05',
  glow: 'rgba(201, 150, 47, 0.28)',
  glowSoft: 'rgba(201, 150, 47, 0.12)',
} as const;

// The literary serif carries all reading-surface type (D-054) - titles,
// body copy, buttons - not just display headers. RN has no global text
// default, so styles opt in via `fontFamily: fonts.serif`.
export const fonts = {
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
} as const;

// Flat placeholder-cover hues for books without cover art, the colored-cover
// fallback StoryGraph renders. Mid-dark so white title text stays readable.
const spineColors = ['#7d4032', '#4f5d43', '#3f4a63', '#a3762a', '#5d4260', '#8a4a21'] as const;

export function spineColorFor(id: number): string {
  return spineColors[Math.abs(id) % spineColors.length];
}

// Physical-depth elevation tokens (D-054). Cards read as paper inserts
// resting on the desk; buttons read as objects that can be pressed.
// elevation covers Android, shadow* covers iOS.
export const cardShadow = {
  elevation: 3,
  shadowColor: '#2a1c11',
  shadowOpacity: 0.18,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
} as const;

export const buttonShadow = {
  elevation: 2,
  shadowColor: '#2a1c11',
  shadowOpacity: 0.22,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
} as const;
