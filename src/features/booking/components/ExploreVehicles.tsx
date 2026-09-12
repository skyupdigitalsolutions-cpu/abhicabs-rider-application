/**
 * src/features/booking/components/ExploreVehicles.tsx
 *
 * The "Explore" strip under the booking card: a two-column grid of vehicle
 * cards with a View all link through to the full Vehicles screen.
 *
 * Rendered inside the home sheet's ScrollView, so it lays the grid out with
 * flexWrap rather than a FlatList. A nested scrollable inside a scrollable
 * fights the parent for the gesture, and with four fixed items there is no
 * virtualisation to win back.
 */

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { VEHICLES, VEHICLE_PREVIEW_COUNT, type VehicleShowcase } from '../../../config/vehicles';
import { colors, radius, spacing, type } from '../../../theme';

interface Props {
  onViewAll: () => void;
  /**
   * Rendered after the grid, inside the same dark panel. Passed in rather
   * than hardcoded here so the banner stays a promotional slot the screen
   * controls, not something baked into the vehicle list.
   */
  footer?: React.ReactNode;
  onSelect?: (v: VehicleShowcase) => void;
  /**
   * Horizontal padding of the container this sits in. Cancelled with a
   * negative margin so the dark panel runs edge to edge.
   */
  edgeInset?: number;
  /**
   * Bottom padding of the container. Also cancelled, then re-applied INSIDE
   * the panel — otherwise the dark block stops short and leaves a white strip
   * above the tab bar. Passed in rather than hardcoded because only the
   * parent knows how much clearance its own chrome needs.
   */
  bottomInset?: number;
}

export function ExploreVehicles({
  onViewAll, onSelect, footer, edgeInset = spacing.xl, bottomInset = 0,
}: Props) {
  const preview = VEHICLES.slice(0, VEHICLE_PREVIEW_COUNT);
  if (preview.length === 0) return null;

  return (
    <View
      style={[
        styles.panel,
        {
          marginHorizontal: -edgeInset,
          paddingHorizontal: edgeInset,
          marginBottom: -bottomInset,
          paddingBottom: bottomInset + spacing.lg,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.heading}>Explore</Text>
        <Pressable onPress={onViewAll} hitSlop={10} accessibilityRole="link">
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {preview.map((v) => (
          <VehicleCard key={v.key} vehicle={v} onPress={onSelect ? () => onSelect(v) : undefined} />
        ))}
      </View>

      {footer}
    </View>
  );
}

export function VehicleCard({
  vehicle,
  onPress,
  wide = false,
}: {
  vehicle: VehicleShowcase;
  onPress?: () => void;
  /** Full-width variant used on the Vehicles screen. */
  wide?: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, wide && styles.cardWide]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${vehicle.name}, ${vehicle.seats} seats`}
    >
      <Text style={styles.cardName}>{vehicle.name}</Text>

      <View style={styles.art}>
        {vehicle.image ? (
          // contain, not cover: vehicle artwork cropped at the edges looks
          // broken, and letterboxing on a dark card is barely visible.
          <Image source={vehicle.image} style={styles.artImage} resizeMode="contain" />
        ) : (
          <Text style={styles.artGlyph}>{vehicle.glyph}</Text>
        )}
      </View>

      {wide ? (
        <Text style={styles.cardMeta} numberOfLines={2}>
          {vehicle.seats} seats · {vehicle.luggage}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * Dark panel breaking out of the white sheet. The negative margins cancel
   * the sheet's own horizontal padding so the panel runs edge to edge, which
   * is what makes it read as a separate section rather than another card.
   */
  panel: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: colors.text,
    // Horizontal and bottom insets are applied inline — they depend on the
    // parent's padding, which this component cannot know.
  },

  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  heading: { ...type.title, fontSize: 18, color: '#FFFFFF' },
  viewAll: {
    ...type.label, color: colors.primary, fontWeight: '700',
    textDecorationLine: 'underline',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },

  card: {
    // Two per row: half the space, minus half the gap.
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: radius.md,
    // #1E1E1E on #111111 is only a few shades apart, so on a phone in daylight
    // the cards blur into the panel. The border does the separating; the fill
    // stays subtle so the artwork keeps the attention.
    borderWidth: 1,
    borderColor: '#F6C31833',
    padding: spacing.md,
  },
  cardWide: { width: '100%' },
  cardName: { ...type.label, color: '#FFFFFF', fontWeight: '700' },
  cardMeta: { ...type.caption, color: 'rgba(255,255,255,0.65)', marginTop: spacing.xs },

  art: {
    height: 84, marginTop: spacing.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  artImage: { width: '100%', height: '100%' },
  artGlyph: { fontSize: 44 },
});