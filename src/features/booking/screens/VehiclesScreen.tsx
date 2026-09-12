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
import { GlassPanel } from '../components/GlassPanel';
import { VehicleDetailSheet } from '../components/VehicleDetailSheet';
import type { VehiclesScreenProps } from '../../../navigation/types';
import { colors, layout, radius, spacing, type } from '../../../theme';

const { width: SCREEN_W } = Dimensions.get('window');

const EDGE = spacing.lg;
const CARD_W = SCREEN_W - EDGE * 2;
const CARD_H = 152;

type FilterKey = 'ALL' | 'CARS' | 'GROUP';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CARS', label: 'Cars' },
  { key: 'GROUP', label: 'Groups' },
];

function matches(v: VehicleShowcase, f: FilterKey): boolean {
  if (f === 'ALL') return true;
  if (f === 'CARS') return v.seats <= 4;
  return v.seats > 4;
}

export function VehiclesScreen({ navigation }: VehiclesScreenProps) {
  const [selected, setSelected] = useState<VehicleShowcase | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const shown = useMemo(() => VEHICLES.filter((v) => matches(v, filter)), [filter]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>ABHICABS</Text>
        <Text style={styles.title}>Our fleet</Text>
        <Text style={styles.intro}>
          Tap any vehicle to see it from every angle. Prices depend on your route and timing.
        </Text>

        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {active ? (
                  <View style={[styles.filter, styles.filterActive]}>
                    <Text style={[styles.filterText, styles.filterTextActive]}>{f.label}</Text>
                  </View>
                ) : (
                  <GlassPanel cornerRadius={radius.pill} style={styles.filter}>
                    <Text style={styles.filterText}>{f.label}</Text>
                  </GlassPanel>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {shown.map((v) => (
            <ShowcaseCard key={v.key} vehicle={v} onPress={() => setSelected(v)} />
          ))}
        </View>

        {shown.length === 0 ? (
          <Text style={styles.empty}>No vehicles in this category yet.</Text>
        ) : null}
      </ScrollView>

      <VehicleDetailSheet
        vehicle={selected}
        onClose={() => setSelected(null)}
        onBook={() => {
          setSelected(null);
          // Back to Home, where a route can actually be entered. Price and
          // availability are decided there, against a real trip.
          navigation.navigate('Home');
        }}
      />
    </View>
  );
}

function ShowcaseCard({
  vehicle,
  onPress,
}: {
  vehicle: VehicleShowcase;
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
            maker's badge. Kept monochrome so it never competes with the
            vehicle beside it. */}
        <Text style={styles.mark}>🚕</Text>

        <Text style={styles.name} numberOfLines={2}>
          {vehicle.name}
        </Text>
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>👤 {vehicle.seats} Seat{vehicle.seats === 1 ? '' : 's'}</Text>
        </View>

        <View style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>
            🧳 {vehicle.luggage}
          </Text>
        </View>

        {/* The accent chip. In a rental app this slot holds the price; here
            there is none to show — a fare needs a route, a time and a trip
            type, none of which exist yet — so it carries the angle count, which
            is the thing tapping the card actually gets you. */}
        <View style={styles.chipAccent}>
          <Text style={styles.chipAccentText}>{multi ? `${vehicle.angles.length} views` : 'Details'}</Text>
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

  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  filter: { paddingVertical: 7, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  filterActive: { backgroundColor: colors.primary },
  filterText: { ...type.caption, fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  filterTextActive: { color: colors.primaryText, fontWeight: '700' },

  list: { gap: spacing.lg },

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
  mark: { fontSize: 18, marginBottom: spacing.xs },
  name: { ...type.title, fontSize: 19, color: colors.text, lineHeight: 24 },

  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: {
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