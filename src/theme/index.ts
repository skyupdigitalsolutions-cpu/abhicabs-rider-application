/**
 * src/theme/index.ts
 *
 * Strict 3-colour brand palette:
 *   #111111 (ink)  ·  #FFC107 (amber, the accent)  ·  #FFFFFF (white)
 * Greys below are derived from ink so muted text, borders, and alt surfaces have
 * contrast without introducing new hues. Light theme (white background).
 */

import { Platform, StatusBar } from 'react-native';

/** Height of the navigation header bar itself, excluding the status bar. */
const HEADER_BAR_H = 56;

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

/**
 * Screen-level padding, shared by every scrollable page so they all start and
 * end at the same distance from the edge.
 *
 * Defined here rather than repeated per screen because that repetition is
 * exactly how the drift happened: some screens reached for spacing.lg and
 * others for spacing.xl, so the top of the content jumped as the rider moved
 * between them. Changing this one value now moves every page together.
 *
 * The value matches the Account screen, which is the reference.
 */
export const layout = {
  screenPaddingY: spacing.lg,
  screenPaddingX: spacing.lg,

  /**
   * How far down a screen with a TRANSPARENT header must start so its content
   * clears the floating back arrow.
   *
   * Computed from the status bar rather than read from useHeaderHeight(): that
   * hook needs a SafeAreaProvider above it, which this app does not mount, so
   * it reports 0 and the content slides under the arrow. StatusBar.currentHeight
   * is the same approach HomeScreen already uses for its own overlay chrome, so
   * the two agree by construction.
   *
   * Android reports a real status bar height; iOS returns undefined, so the
   * fallback is a notch-safe default.
   */
  headerOffset:
    (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 47) + HEADER_BAR_H,
} as const;

export const button = {
  
}