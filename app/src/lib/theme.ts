// Design-system tokens (D-089). The Figma design brief reframed Bookmarkt
// as an intimate reading journal: parchment canvas, warm off-white cards,
// walnut ink, russet (leather) actions, and antique gold kept for
// highlights and badges only. Every screen reads these shared tokens rather
// than choosing its own near-miss values.
export const colors = {
  // Main canvas - parchment.
  background: '#F4EDE1',
  // Card surfaces - warm off-white.
  card: '#FFFCF6',
  // Secondary surfaces: segmented-control tracks, chips, soft panels.
  surface2: '#EDE0D0',
  // Borders and separators: russet at ~12% opacity.
  border: 'rgba(125, 52, 23, 0.12)',
  borderStrong: 'rgba(125, 52, 23, 0.24)',
  // Primary text and structure - walnut.
  text: '#2A1C11',
  // Secondary text.
  muted: '#7C6B59',
  // Primary actions - leather / russet - and the ink that sits on them.
  accent: '#7D3417',
  onAccent: '#FFFFFF',
  accentSoft: '#F1E4D8',
  danger: '#9D271F',
  // Trend ink (D-064): a rising number in gold ink, a dip in cool slate.
  rise: '#8A660F',
  riseSoft: '#F3EAD3',
  fall: '#3F4A63',
  fallSoft: '#E7EAF1',
  // Walnut is still the immersion surface for the reading timer and the
  // structural dark panels; `onWalnut` tokens are its ink.
  walnut: '#2A1C11',
  // The band under Android's 3-button navigation (D-093): a step darker than
  // the tab bar so the system's strip reads as the system's, not as ours.
  walnutDeep: '#1C1109',
  walnutBorder: '#4A301C',
  onWalnut: '#F2E7CE',
  onWalnutMuted: '#B7A17F',
} as const;

// Antique gold: highlights, badges, finished markers, premium hints, active
// trend ink. No longer the primary-action fill (that is russet).
export const gold = {
  base: '#C9962F',
  deep: '#8A660F',
  // Retained for the few genuinely gold fills (heatmap, sandglass, badges).
  fill: '#C9962F',
  onFill: '#2A1C05',
  glow: 'rgba(201, 150, 47, 0.28)',
  glowSoft: 'rgba(201, 150, 47, 0.12)',
} as const;

// Bundled families (loaded in the root layout via expo-font). Lora carries
// screen titles, section headings, book titles, quotes, and editorial
// labels; Inter carries body, metadata, controls, and navigation. Each
// weight is its own registered family, so styles pick a family instead of
// setting `fontWeight` (Android would otherwise synthesise a fake bold).
export const fonts = {
  serif: 'Lora_400Regular',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
} as const;

// Representative type scale from the brief.
export const type = {
  screenTitle: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 40, color: colors.text },
  detailTitle: { fontFamily: fonts.serif, fontSize: 25, lineHeight: 32, color: colors.text },
  heading: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.text },
  quote: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 32, color: colors.text },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.text },
  bodySmall: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.text },
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.muted,
  },
  control: { fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 20, color: colors.text },
} as const;

// Spacing rhythm 4 / 8 / 16 / 24, with 24 as the outer horizontal padding.
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radii = { card: 16, button: 8, chip: 999, circle: 24, field: 10 } as const;

// Fixed sizes from the brief.
export const sizes = { button: 48, circleButton: 48, touch: 44 } as const;

// Flat placeholder-cover hues for books without cover art, the colored-cover
// fallback StoryGraph renders. Mid-dark so white title text stays readable.
const spineColors = ['#7d4032', '#4f5d43', '#3f4a63', '#a3762a', '#5d4260', '#8a4a21'] as const;

export function spineColorFor(id: number): string {
  return spineColors[Math.abs(id) % spineColors.length];
}

// Soft elevation: walnut at ~5%, offset 4 down, blur 12. Cards float
// gently; nothing casts a heavy shadow. elevation covers Android, shadow*
// covers iOS.
export const cardShadow = {
  elevation: 2,
  shadowColor: '#2A1C11',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
} as const;

export const buttonShadow = {
  elevation: 1,
  shadowColor: '#2A1C11',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
} as const;
