/**
 * src/features/booking/components/GlassPanel.tsx
 *
 * A frosted-glass surface built from layered translucency.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT expo-blur
 * ---------------------------------------------------------------------------
 * A real BlurView samples what is behind it — over a flat near-black screen
 * there is nothing to sample, so it costs a native module (and a dev-client
 * rebuild) to produce a slightly murkier rectangle. What actually reads as
 * glass is the other four ingredients, none of which need native code:
 *
 *   1. COLOUR BEHIND IT. Glass is only visible when something shows through.
 *      Each panel drops one or two soft colour blobs underneath, so the tint
 *      bleeds up through the translucent fill.
 *   2. A TRANSLUCENT WHITE FILL, not a solid grey. Low alpha white over a dark
 *      screen is what gives the milky lift.
 *   3. A LIT RIM. A hairline border that is brighter at the top than the
 *      bottom, because glass catches light on its top edge.
 *   4. A SPECULAR SWEEP. One diagonal highlight across the upper-left corner —
 *      the single cue that most says "this is a pane", not "this is a card".
 *
 * If expo-blur is ever added, the only change needed is dropping a BlurView in
 * beneath `glassFill`; every other layer here still applies.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../../../theme';

interface Props {
  children: ReactNode;
  /** Colour blobs that glow up through the glass. 1–2 reads best. */
  blobs?: { color: string; size: number; top?: number; left?: number; right?: number; bottom?: number }[];
  /** Corner radius. Panels inside panels want a smaller one. */
  cornerRadius?: number;
  /** Raises the fill and rim for a panel that should sit forward. */
  strong?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassPanel({ children, blobs = [], cornerRadius = radius.lg, strong, style }: Props) {
  return (
    <View style={[styles.root, { borderRadius: cornerRadius }, strong && styles.rootStrong, style]}>
      {/* 1 — colour behind the glass */}
      {blobs.map((b, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.blob,
            {
              backgroundColor: b.color,
              width: b.size,
              height: b.size,
              borderRadius: b.size / 2,
              top: b.top,
              left: b.left,
              right: b.right,
              bottom: b.bottom,
            },
          ]}
        />
      ))}

      {/* 2 — the milky fill */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, strong ? styles.fillStrong : styles.fill]}
      />

      {/* 4 — specular sweep across the upper-left */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.04)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 3 — the lit top rim, sitting just inside the border */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.rim}
      />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    // A soft drop shadow separates the pane from the backdrop; without it the
    // glass looks painted on rather than floating above.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  rootStrong: { borderColor: 'rgba(255,255,255,0.24)' },

  blob: { position: 'absolute', opacity: 0.55 },

  fill: { backgroundColor: 'rgba(255,255,255,0.07)' },
  fillStrong: { backgroundColor: 'rgba(255,255,255,0.11)' },

  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
});