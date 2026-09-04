/**
 * src/theme/index.ts
 *
 * Strict 3-colour brand palette:
 *   #111111 (ink)  ·  #FFC107 (amber, the accent)  ·  #FFFFFF (white)
 * Greys below are derived from ink so muted text, borders, and alt surfaces have
 * contrast without introducing new hues. Light theme (white background).
 */

export const colors = {
  // surfaces
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  border: '#E6E6E6',

  // text (greyscale of ink)
  text: '#111111',
  textMuted: '#6B6B6B',

  // accent
  primary: '#FFC107',
  primaryText: '#111111', // text on amber is ink for contrast

  // feedback (kept minimal; amber carries "attention", a single red for destructive)
  danger: '#C0392B',
  warning: '#FFC107',

  overlay: 'rgba(17,17,17,0.5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const button = {
  
}