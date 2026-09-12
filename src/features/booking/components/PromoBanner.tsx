/**
 * src/features/booking/components/PromoBanner.tsx
 *
 * The wide promotional card under the vehicle grid: copy on the left, artwork
 * on the right, amber fading to ink left-to-right.
 *
 * The gradient runs TOP TO BOTTOM, so both the copy and the artwork sit across
 * the same range of tones rather than each getting their own end of it.
 *
 * That constrains the palette: whatever colour the text is has to stay legible
 * against every stop, because the text spans the full height. Ink text over
 * amber-into-white works; ink over amber-into-ink would leave the subtitle
 * unreadable. `gradient` is a prop so the stops can be tuned without that
 * constraint being buried in the component.
 */

import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, type } from '../../../theme';

export interface PromoBannerProps {
  title: string;
  subtitle?: string;
  /** null renders the glyph instead, so the banner works before art exists. */
  image?: ImageSourcePropType | null;
  /** Stand-in while there is no image. */
  glyph?: string;
  onPress?: () => void;
  /**
   * Gradient stops, top to bottom. At least two.
   *
   * Keep every stop light enough for ink text — the copy runs the full height
   * of the banner, so a dark stop anywhere will swallow part of it.
   */
  gradient?: readonly [string, string, ...string[]];
}

const DEFAULT_GRADIENT = [colors.primary, '#F6C318', colors.text] as const;

export function PromoBanner({
  title, subtitle, image = null, glyph = '🚗', onPress,
  gradient = DEFAULT_GRADIENT,
}: PromoBannerProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={styles.wrap}
    >
      <LinearGradient
        colors={[...gradient]}
        // Same x, y from 0 to 1 — a straight vertical sweep. Any difference
        // in x would tilt it.
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.95 }}
        style={styles.gradient}
      >
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Absolutely positioned and pinned to the bottom-right, so the
            artwork can sit on the container's edge and be clipped by its
            rounded corners — the podium look in the reference. Rendered last
            and given a zIndex so it layers over the gradient on both
            platforms; sibling order alone decides this on iOS, but Android
            also weighs elevation, and an explicit zIndex settles it. */}
        <View style={styles.art} pointerEvents="none">
          {image ? (
            <Image source={image} style={styles.artImage} resizeMode="contain" />
          ) : (
            <Text style={styles.artGlyph}>{glyph}</Text>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F6C31833',
  },
  gradient: {
    justifyContent: 'center',
    minHeight: 140,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  // Fixed width rather than flex: the art is out of the layout flow now, so
  // there is nothing left to push against and a flexed copy block would run
  // straight under the car.
  copy: { width: '54%', gap: spacing.xs },
  title: { ...type.title, fontSize: 20, color: colors.surface, fontWeight: '800' },
  subtitle: { ...type.body, fontSize: 14, color: colors.surface },

  art: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    // With resizeMode="contain" the image scales to whichever axis runs out
    // first. This box is roughly square (≈150x132), so a SQUARE-ish source
    // fills the height and its bottom edge lands flush on the container's
    // bottom — the "sitting on the edge" look. A wide source (4:3, 16:9) fits
    // by width instead and floats 15-45px above the bottom, so crop the art
    // tight to the vehicle with no empty space beneath it.
    width: '44%',
    height: 132,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  artImage: { width: '100%', height: '100%' },
  artGlyph: { fontSize: 52, marginBottom: spacing.md },
});