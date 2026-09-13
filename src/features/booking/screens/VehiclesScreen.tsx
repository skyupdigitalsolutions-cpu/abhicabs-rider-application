/**
 * src/features/booking/screens/VehiclesScreen.tsx
 *
 * The full fleet as full-width spec cards: badge and name top-left, the vehicle
 * overhanging the right edge, a chip row along the bottom. Tapping one opens a
 * dark-glass hero sheet.
 *
 * ---------------------------------------------------------------------------
 * WHY WIDE CARDS RATHER THAN A GRID
 * ---------------------------------------------------------------------------
 * A two-column grid gives each vehicle about 160pt — enough to identify it, not
 * enough to admire it. These cards give the artwork roughly half the screen and
 * let it run past the right edge, which is what makes a vehicle read as a
 * product shot instead of a catalogue thumbnail.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CARDS ARE LIGHT ON A DARK SCREEN
 * ---------------------------------------------------------------------------
 * The inversion is doing real work. These vehicle PNGs are dark-bodied, and a
 * dark car on a dark pane loses its edges; a white card gives it something to
 * cut against. It also puts the chip row on a light ground, where small grey
 * text is far easier to read than white-on-translucent at 11pt.
 *
 * The dark glass is still the app's material — it is what the screen chrome and
 * the detail sheet are made of. The cards are the exception, and being the
 * exception is precisely why they draw the eye.
 */

import { useMemo, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VEHICLES, type VehicleShowcase } from '../../../config/vehicles';
import { VehicleCategoryRow, useClassFromPrices } from '../components/VehicleCategoryRow';
import type { VehiclesScreenProps } from '../../../navigation/types';
import { colors, layout, radius, spacing, type } from '../../../theme';

/**
 * Card icons, imported as COMPONENTS via react-native-svg-transformer. Not
 * <Image source={require(...)}>: React Native cannot decode an .svg that way
 * and silently draws an empty box.
 */
import SeatIcon from '../../../../assets/icons/seat.svg';
import BagIcon from '../../../../assets/icons/bag.svg';
import CarIcon from '../../../../assets/icons/car.svg';

const { width: SCREEN_W } = Dimensions.get('window');

const EDGE = spacing.lg;
const CARD_W = SCREEN_W - EDGE * 2;
const CARD_H = 152;

/** The maker's-badge mark in the card's top-left corner. */
const MARK_SIZE = 20;
/** Glyph size inside the spec chips — sized to the 11pt text beside it. */
const CHIP_ICON = 13;

export function VehiclesScreen({ navigation }: VehiclesScreenProps) {
  /** Which class the category row has filtered to. null = all. */
  const [category, setCategory] = useState<string | null>(null);

  // The same cached query the row uses, so the list shows prices without a
  // second request.
  const { data: prices } = useClassFromPrices();

  const shown = useMemo(
    () => (category ? VEHICLES.filter((v) => v.key === category) : VEHICLES),
    [category],
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>ABHICABS</Text>
        <Text style={styles.title}>Our fleet</Text>
        <Text style={styles.intro}>
          Tap any vehicle to see it from every angle. Prices depend on your route and timing.
        </Text>

        <VehicleCategoryRow selected={category} onSelect={setCategory} />

        <View style={styles.list}>
          {shown.map((v) => (
            <ShowcaseCard
              key={v.key}
              vehicle={v}
              price={prices?.[v.key]}
              onPress={() => navigation.navigate('VehicleDetail', { vehicleKey: v.key })}
            />
          ))}
        </View>

        {shown.length === 0 ? (
          <Text style={styles.empty}>No vehicles in this category yet.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ShowcaseCard({
  vehicle,
  price,
  onPress,
}: {
  vehicle: VehicleShowcase;
  /** Cheapest rental package for this class, when the backend has one. */
  price?: number;
  onPress: () => void;
}) {
  // The card shows one shot; every angle lives in the detail sheet.
  const hero = vehicle.angles[0]?.source ?? vehicle.image;
  const multi = vehicle.angles.length > 1;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${vehicle.name}, ${vehicle.seats} seats, ${vehicle.luggage}. See details.`}
    >
      {/* Artwork first so the text layer paints over it. Pushed right and
          allowed to overhang the card edge — the crop is what makes it read as
          a product shot rather than a centred thumbnail. */}
      {hero ? (
        <Image source={hero} style={styles.hero} resizeMode="contain" />
      ) : (
        <Text style={styles.heroGlyph}>{vehicle.glyph}</Text>
      )}

      <View style={styles.cardTop}>
        {/* A small mark in the corner, the way a spec sheet is headed by the
            maker's badge. Filled with the text colour rather than left to its
            own, so it reads as typography and never competes with the vehicle
            beside it. */}
        <View style={styles.mark}>
          <CarIcon width={MARK_SIZE} height={MARK_SIZE} fill={colors.text} />
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {vehicle.name}
        </Text>
      </View>

      <View style={styles.chipRow}>
        {/* The glyphs sit BESIDE the text, not inside it: an SVG component
            cannot live inside <Text> the way an emoji could, so each chip is a
            row rather than a single string. */}
        <View style={styles.chip}>
          <SeatIcon width={CHIP_ICON} height={CHIP_ICON} fill={colors.textMuted} />
          <Text style={styles.chipText}>
            {vehicle.seats} Seat{vehicle.seats === 1 ? '' : 's'}
          </Text>
        </View>

        <View style={styles.chip}>
          <BagIcon width={CHIP_ICON} height={CHIP_ICON} fill={colors.textMuted} />
          <Text style={styles.chipText} numberOfLines={1}>
            {vehicle.luggage}
          </Text>
        </View>

        {/* The accent chip carries a REAL price when the backend has one —
            the cheapest rental package for this class. With no package seeded
            it falls back to what tapping the card gets you, rather than to an
            invented figure the quote screen would contradict. */}
        <View style={styles.chipAccent}>
          <Text style={styles.chipAccentText}>
            {price !== undefined
              ? `₹${Math.round(price).toLocaleString('en-IN')}`
              : multi
                ? `${vehicle.angles.length} views`
                : 'Details'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0C' },

  content: {
    paddingHorizontal: EDGE,
    // The header is transparent, so content must start below the back arrow.
    paddingTop: layout.headerOffset + layout.screenPaddingY,
    paddingBottom: layout.screenPaddingY,
  },

  eyebrow: {
    ...type.caption,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  title: { ...type.display, fontSize: 30, color: '#FFFFFF' },
  intro: {
    ...type.caption,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
    marginTop: spacing.sm,
  },

  list: { gap: spacing.lg, marginTop: spacing.xl },

  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.lg,
    // White, against the dark screen. The inversion is the whole point: a light
    // card is what lets a dark vehicle read, and vice versa.
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
    // overflow stays visible so the artwork can overhang the right edge.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  hero: {
    position: 'absolute',
    right: -spacing.sm,
    top: spacing.xs,
    width: CARD_W * 0.58,
    height: CARD_H * 0.62,
  },
  heroGlyph: { position: 'absolute', right: spacing.xl, top: spacing.lg, fontSize: 48 },

  cardTop: { paddingRight: CARD_W * 0.45 },
  mark: { marginBottom: spacing.xs },
  name: { ...type.title, fontSize: 19, color: colors.text, lineHeight: 24 },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: {
    // A row now that the glyph is a sibling of the label rather than part of it.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    flexShrink: 1,
  },
  chipText: { ...type.caption, fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  chipAccent: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,193,7,0.22)',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  chipAccentText: { ...type.caption, fontSize: 11, color: '#8A6D0B', fontWeight: '700' },

  empty: {
    ...type.body,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});