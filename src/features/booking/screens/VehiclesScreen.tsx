/**
 * src/features/booking/screens/VehiclesScreen.tsx
 *
 * The full fleet, reached from "View all" on the home screen. Two vehicles per
 * row; tapping one opens a detail sheet with every angle at full width.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THE CARD READ AS A PRODUCT RATHER THAN A LIST ROW
 * ---------------------------------------------------------------------------
 * Three things, in order of how much they do:
 *
 *  1. A SPOTLIGHT behind the artwork — a soft amber ellipse that lifts the
 *     vehicle off the panel. Cut-out PNGs on a flat dark fill look like they
 *     are floating in nothing; a ground glow gives them somewhere to sit.
 *  2. A GRADIENT fill rather than a single colour, so the card has a top-lit
 *     direction instead of reading as a grey rectangle.
 *  3. SPEC CHIPS instead of sentences. Seats and luggage are the two questions
 *     riders actually have, and chips let them be compared down the column at a
 *     glance rather than re-read per card.
 *
 * Tapping a vehicle opens DETAILS, not a booking. The fare a rider is offered
 * depends on the route, the time and the trip type, none of which exist yet at
 * this point — availability and price are decided on the Choose ride screen,
 * against a real route.
 */

import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useHeaderHeight } from '@react-navigation/elements';
import { VEHICLES, type VehicleShowcase } from '../../../config/vehicles';
import { VehicleGallery } from '../components/VehicleGallery';
import { VehicleDetailSheet } from '../components/VehicleDetailSheet';
import type { VehiclesScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

const { width: SCREEN_W } = Dimensions.get('window');

/** Screen padding, the gap between the two columns, and the card's own padding. */
const EDGE = spacing.lg;
const GAP = spacing.md;
const CARD_PAD = spacing.md;

/** One column, and the usable width inside it once padding and border are off. */
const CARD_W = Math.floor((SCREEN_W - EDGE * 2 - GAP) / 2);
const GALLERY_W = CARD_W - CARD_PAD * 2 - 2;

export function VehiclesScreen(_props: VehiclesScreenProps) {
  /** The vehicle whose detail sheet is open. null = closed. */
  const [selected, setSelected] = useState<VehicleShowcase | null>(null);

  /**
   * The header is transparent, so content would otherwise start underneath the
   * back arrow. Asking the navigator for its height covers the status bar and
   * the notch without hardcoding a number per device.
   */
  const headerHeight = useHeaderHeight();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: headerHeight + spacing.sm }]}>
        <Text style={styles.title}>Our fleet</Text>
        <Text style={styles.intro}>
          Tap any vehicle to see it from every angle. Prices depend on your route and timing —
          you will pick a vehicle once your trip is entered.
        </Text>

        <View style={styles.grid}>
          {VEHICLES.map((v) => (
            <VehicleCardLarge key={v.key} vehicle={v} onPress={() => setSelected(v)} />
          ))}
        </View>
      </ScrollView>

      <VehicleDetailSheet vehicle={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function VehicleCardLarge({
  vehicle,
  onPress,
}: {
  vehicle: VehicleShowcase;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${vehicle.name}, ${vehicle.seats} seats, ${vehicle.luggage}. See details.`}
    >
      <LinearGradient
        // Top-lit: a shade above the panel at the top falling to a shade below
        // it at the bottom. Subtle on purpose — enough to give the card a
        // direction without turning it into a button.
        colors={['#262626', '#171717']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardFill}
      >
        {/* Soft ground glow under the artwork. pointerEvents none so it never
            steals the swipe from the gallery sitting on top of it. */}
        <View style={styles.spotlight} pointerEvents="none" />

        <VehicleGallery
          angles={vehicle.angles}
          glyph={vehicle.glyph}
          width={GALLERY_W}
          height={96}
        />

        <Text style={styles.name} numberOfLines={1}>
          {vehicle.name}
        </Text>
        <Text style={styles.blurb} numberOfLines={2}>
          {vehicle.blurb}
        </Text>

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>👤 {vehicle.seats}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              🧳 {vehicle.luggage}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text, paddingTop:16 },
  content: { paddingHorizontal: EDGE, paddingBottom: spacing.xxl },

  title: { ...type.display, fontSize: 24, color: '#FFFFFF' },
  intro: {
    ...type.caption,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 17,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },

  card: {
    width: CARD_W,
    borderRadius: radius.lg,
    // Clip the gradient and the spotlight to the rounded corners.
    overflow: 'hidden',
    borderWidth: 1,
    // The amber-tinted hairline is what separates card from panel: #1E1E1E on
    // #111111 is only a few shades apart and blurs together in daylight.
    borderColor: '#F6C31833',
  },
  cardPressed: { opacity: 0.75 },
  cardFill: { padding: CARD_PAD },

  spotlight: {
    position: 'absolute',
    // Sits under where the vehicle's wheels land, bleeding past the card edges
    // so it reads as light rather than as a shape.
    top: 58,
    left: -CARD_W * 0.15,
    right: -CARD_W * 0.15,
    height: 78,
    borderRadius: 999,
    backgroundColor: 'rgba(255,193,7,0.10)',
  },

  name: { ...type.label, fontSize: 15, color: '#FFFFFF', marginTop: spacing.md },
  blurb: {
    ...type.caption,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 15,
    marginTop: 2,
    // Two lines reserved so the chip rows line up across a mismatched pair.
    minHeight: 30,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  chipText: { ...type.caption, fontSize: 10, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },
});