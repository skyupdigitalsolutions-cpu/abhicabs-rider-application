/**
 * src/features/booking/components/VehicleCategoryRow.tsx
 *
 * The circular category strip at the top of the Vehicles screen — Sedan, SUV,
 * Tempo, Bus — replacing what a rental app would use for brand logos.
 *
 * ---------------------------------------------------------------------------
 * WHY CATEGORIES AND NOT BRANDS
 * ---------------------------------------------------------------------------
 * A rider booking a cab does not choose a manufacturer; they choose how many
 * people and how much luggage they are moving. Class IS the decision, so it
 * gets the prominent row. It doubles as the filter for the list below, which is
 * why the pill filters it replaces are gone — two controls doing one job is one
 * too many.
 *
 * ---------------------------------------------------------------------------
 * ON THE PRICES
 * ---------------------------------------------------------------------------
 * The "from" figure is REAL and comes from the backend: the cheapest active
 * local-rental package for that class in the current city, via
 * GET /fares/rental-packages. That is the only price the backend can give
 * without a route, since every other fare needs an origin, a destination and a
 * time.
 *
 * If a class has no package seeded, no price is shown for it. It deliberately
 * does NOT fall back to a guess: a wrong "from ₹499" that the quote screen then
 * contradicts is worse than showing nothing at all.
 */

import { useQuery } from '@tanstack/react-query';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fareApi } from '../../../api/endpoints';
import { DEFAULT_CITY } from '../../../config/catalog';
import { VEHICLES, type VehicleShowcase } from '../../../config/vehicles';
import { colors, radius, spacing, type } from '../../../theme';

interface Props {
  /** null means "All". */
  selected: string | null;
  onSelect: (key: string | null) => void;
}

/**
 * Cheapest package fare per vehicleClass, keyed by class.
 *
 * Packages arrive as a flat list across all classes, so this reduces them to
 * one number each — the figure a "from" price is supposed to mean.
 */
export function useClassFromPrices() {
  return useQuery({
    queryKey: ['rental-packages', DEFAULT_CITY.id],
    queryFn: async () => {
      const { packages } = await fareApi.rentalPackages(DEFAULT_CITY.id);
      const cheapest: Record<string, number> = {};
      for (const p of packages) {
        const fare = Number(p.packageFare);
        if (!Number.isFinite(fare)) continue;
        const prev = cheapest[p.vehicleClass];
        if (prev === undefined || fare < prev) cheapest[p.vehicleClass] = fare;
      }
      return cheapest;
    },
    // Packages change rarely; an hour avoids refetching on every visit.
    staleTime: 60 * 60 * 1000,
    // A missing price is a silent omission, never an error state — the screen
    // is still perfectly usable without it.
    retry: 1,
  });
}

export function VehicleCategoryRow({ selected, onSelect }: Props) {
  const { data: prices } = useClassFromPrices();

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.heading}>Vehicles</Text>
        {selected ? (
          <Pressable onPress={() => onSelect(null)} hitSlop={8}>
            <Text style={styles.clear}>Show all</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {VEHICLES.map((v) => (
          <CategoryItem
            key={v.key}
            vehicle={v}
            active={selected === v.key}
            price={prices?.[v.key]}
            onPress={() => onSelect(selected === v.key ? null : v.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function CategoryItem({
  vehicle,
  active,
  price,
  onPress,
}: {
  vehicle: VehicleShowcase;
  active: boolean;
  price?: number;
  onPress: () => void;
}) {
  const art = vehicle.angles[0]?.source ?? vehicle.image;

  return (
    <Pressable
      onPress={onPress}
      style={styles.item}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${vehicle.name}${price ? `, from ${price} rupees` : ''}`}
    >
      <View style={[styles.disc, active && styles.discActive]}>
        {art ? (
          <Image source={art} style={styles.art} resizeMode="contain" />
        ) : (
          <Text style={styles.glyph}>{vehicle.glyph}</Text>
        )}
      </View>

      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {vehicle.name}
      </Text>

      {/* Only rendered when the backend actually returned a package for this
          class. No package, no price — never a placeholder. */}
      {price !== undefined ? (
        <Text style={styles.price}>from ₹{Math.round(price).toLocaleString('en-IN')}</Text>
      ) : (
        <Text style={styles.seats}>{vehicle.seats} seats</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  heading: { ...type.title, fontSize: 17, color: '#FFFFFF' },
  clear: { ...type.label, fontSize: 13, color: colors.primary },

  row: { gap: spacing.lg, paddingRight: spacing.lg, paddingBottom: spacing.xs },

  item: { alignItems: 'center', width: 80 },

  disc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  discActive: {
    // Amber ring rather than an amber fill: the artwork has to stay readable,
    // and a solid fill behind a white-bodied vehicle erases it.
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(255,193,7,0.12)',
  },
  art: { width: '82%', height: '82%' },
  glyph: { fontSize: 30 },

  label: {
    ...type.caption,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  labelActive: { color: '#FFFFFF' },

  price: { ...type.caption, fontSize: 10, color: colors.primary, fontWeight: '700', marginTop: 1 },
  seats: { ...type.caption, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
});