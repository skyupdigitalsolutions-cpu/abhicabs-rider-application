/**
 * src/features/booking/components/HomeMap.tsx
 *
 * The live map at the top of the home screen. Two jobs:
 *   1. Show the rider's location + anonymized nearby cars.
 *   2. Act as a Rapido-style PICKUP PICKER when pickupMode is on: a fixed centre
 *      pin ("Pickup Point") sits over the map; as the user drags the map, the
 *      centre coordinate is reverse-geocoded and reported via onPickupChange, so
 *      the home screen can set the pickup + show the green address chip.
 *
 * Requires a dev build (react-native-maps). Fails soft with a placeholder if we
 * don't have a location yet.
 */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { CarDot } from '../nearby.api';
import { fareApi } from '../../../api/endpoints';
import { colors, radius, spacing, type } from '../../../theme';

export interface PickupChoice {
  lat: number;
  lng: number;
  label: string;
}

interface Props {
  centre: { lat: number; lng: number } | null;
  cars: CarDot[];
  height?: number;
  loading?: boolean;
  fullBleed?: boolean;
  /** When true, show the fixed centre "Pickup Point" pin and report drags. */
  pickupMode?: boolean;
  onPickupChange?: (p: PickupChoice) => void;
}

export function HomeMap({
  centre, cars, height = 260, loading = false, fullBleed = false,
  pickupMode = false, onPickupChange,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const region: Region | undefined = centre
    ? { latitude: centre.lat, longitude: centre.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : undefined;

  // The map's current centre while in pickup mode + its resolved address.
  const centreCoord = useRef({ lat: centre?.lat ?? 0, lng: centre?.lng ?? 0 });
  const [address, setAddress] = useState<string>('');
  const [looking, setLooking] = useState(false);
  const lookedUpFor = useRef('');

  // Recentre on the rider only when NOT actively picking (don't fight the drag).
  useEffect(() => {
    if (centre && mapRef.current && !pickupMode) {
      mapRef.current.animateToRegion(
        { latitude: centre.lat, longitude: centre.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    }
  }, [centre?.lat, centre?.lng, pickupMode]);

  // When the map settles (pickup mode), reverse-geocode the centre once.
  const onRegionChangeComplete = (r: Region) => {
    if (!pickupMode) return;
    centreCoord.current = { lat: r.latitude, lng: r.longitude };
    const key = `${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}`;
    if (key === lookedUpFor.current) return;
    lookedUpFor.current = key;
    setLooking(true);
    fareApi
      .reverseGeocode(r.latitude, r.longitude)
      .then((res) => {
        const label = res.location.formattedAddress;
        setAddress(label);
        onPickupChange?.({ lat: r.latitude, lng: r.longitude, label });
      })
      .catch(() => {
        const label = `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;
        setAddress(label);
        onPickupChange?.({ lat: r.latitude, lng: r.longitude, label });
      })
      .finally(() => setLooking(false));
  };

  if (!centre) {
    return (
      <View style={[styles.wrap, styles.placeholder, fullBleed && styles.fullBleed, { height }]}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.placeholderText}>Enable location to see cars near you</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, fullBleed && styles.fullBleed, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation={!pickupMode}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
        onRegionChangeComplete={onRegionChangeComplete}
      >
        {/* Cars only in normal mode — a cluttered map is bad for picking a pin. */}
        {!pickupMode
          ? cars.map((c, i) => (
              <Marker
                key={`${c.lat},${c.lng},${i}`}
                coordinate={{ latitude: c.lat, longitude: c.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={styles.carDot}><Text style={styles.carGlyph}>🚕</Text></View>
              </Marker>
            ))
          : null}
      </MapView>

      {/* Fixed centre pin — the pickup picker. Sits above the map, never moves. */}
      {pickupMode ? (
        <View pointerEvents="none" style={styles.centerPinWrap}>
          <View style={styles.pickupBadge}>
            <Text style={styles.pickupBadgeText}>Pickup Point</Text>
          </View>
          <Text style={styles.pinGlyph}>📍</Text>
          <View style={styles.pinDot} />
        </View>
      ) : null}

      {/* Top pill: cabs nearby (normal) OR the resolved pickup address (picking) */}
      <View style={[styles.pill, pickupMode && styles.pillAddress]}>
        {pickupMode ? (
          looking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={[styles.pillText, styles.pillAddressText]} numberOfLines={1}>
              📍  {address || 'Move the map to set pickup'}
            </Text>
          )
        ) : (
          <Text style={styles.pillText}>
            {cars.length > 0 ? `${cars.length} cab${cars.length > 1 ? 's' : ''} nearby` : 'Finding cabs near you…'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  fullBleed: { borderRadius: 0, borderWidth: 0 },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  placeholderText: { ...type.body, color: colors.textMuted, textAlign: 'center' },

  carDot: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
  },
  carGlyph: { fontSize: 15 },

  // Fixed centre pin
  centerPinWrap: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  pickupBadge: {
    backgroundColor: '#2E7D32', borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: 4,
  },
  pickupBadgeText: { ...type.label, color: '#FFFFFF', fontWeight: '700' },
  pinGlyph: { fontSize: 40, marginBottom: 24 },
  pinDot: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  pill: {
    position: 'absolute', top: spacing.md, alignSelf: 'center',
    backgroundColor: colors.text, borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  pillText: { ...type.caption, color: '#FFFFFF', fontWeight: '600' },
  pillAddress: { maxWidth: '86%', backgroundColor: '#2E7D32' },
  pillAddressText: { fontSize: 13 },
});