/**
 * src/features/booking/components/HomeMap.tsx
 *
 * The live map at the top of the home screen: the rider's own location, with
 * anonymized nearby-car markers around it. Purely presentational — it takes a
 * centre and a list of car dots and draws them. Requires a dev build
 * (react-native-maps).
 *
 * Fails soft: with no centre yet it shows a muted placeholder rather than a
 * blank or a crash, so the home screen always renders.
 */

import { useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { CarDot } from '../nearby.api';
import { colors, radius, spacing, type } from '../../../theme';

interface Props {
  centre: { lat: number; lng: number } | null;
  cars: CarDot[];
  height?: number;
  loading?: boolean;
  /** Edge-to-edge: no border/radius, fills its container (home full-screen map). */
  fullBleed?: boolean;
}

export function HomeMap({ centre, cars, height = 260, loading = false, fullBleed = false }: Props) {
  const mapRef = useRef<MapView>(null);

  const region: Region | undefined = centre
    ? { latitude: centre.lat, longitude: centre.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : undefined;

  // Keep the map centred on the rider as their location resolves/updates.
  useEffect(() => {
    if (centre && mapRef.current) {
      mapRef.current.animateToRegion(
        { latitude: centre.lat, longitude: centre.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        500,
      );
    }
  }, [centre?.lat, centre?.lng]);

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
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
      >
        {cars.map((c, i) => (
          <Marker
            key={`${c.lat},${c.lng},${i}`}
            coordinate={{ latitude: c.lat, longitude: c.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.carDot}>
              <Text style={styles.carGlyph}>🚕</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* "cabs nearby" pill, like the reference */}
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {cars.length > 0 ? `${cars.length} cab${cars.length > 1 ? 's' : ''} nearby` : 'Finding cabs near you…'}
        </Text>
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

  pill: {
    position: 'absolute', top: spacing.md, alignSelf: 'center',
    backgroundColor: colors.text, borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  pillText: { ...type.caption, color: '#FFFFFF', fontWeight: '600' },
});