/**
 * src/features/trip/components/TripMap.tsx
 *
 * The immersive trip map. Renders pickup, drop, and — while the trip is live —
 * the driver's current position, fitting all of them into view. Built on
 * react-native-maps, so it requires a DEV BUILD (not Expo Go).
 *
 * It is deliberately a dumb, presentational component: it takes coordinates and
 * draws them. All the data (driver lat/lng from liveLocation, pickup/drop from
 * the booking) is resolved by the caller, so this stays trivially reusable.
 */

import { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { colors, radius, spacing, type } from '../../../theme';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  pickup: LatLng;
  drop: LatLng;
  driver?: LatLng | null;
  /** Whether the trip is live (drives which leg of the route is emphasised). */
  live?: boolean;
  height?: number;
}

/** Pads a set of points into a region that comfortably contains all of them. */
function regionFor(points: LatLng[]): Region {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.6, 0.01);
  const lngDelta = Math.max((maxLng - minLng) * 1.6, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export function TripMap({ pickup, drop, driver, live = false, height = 260 }: Props) {
  const mapRef = useRef<MapView>(null);

  const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

  // Refit whenever the meaningful points change (driver moving, or drop set).
  useEffect(() => {
    const points = [pickup, drop, ...(driver ? [driver] : [])];
    const coords = points.map(toCoord);
    if (mapRef.current && coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, driver?.lat, driver?.lng]);

  // The route line: driver -> pickup while heading to the rider (live, driver
  // known); otherwise the plain pickup -> drop leg.
  const routeCoords =
    live && driver
      ? [toCoord(driver), toCoord(pickup), toCoord(drop)]
      : [toCoord(pickup), toCoord(drop)];

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={regionFor([pickup, drop, ...(driver ? [driver] : [])])}
        showsUserLocation={false}
        toolbarEnabled={false}
        loadingEnabled
      >
        <Marker coordinate={toCoord(pickup)} title="Pickup" pinColor="#FFC107" />
        <Marker coordinate={toCoord(drop)} title="Drop" pinColor="#111111" />
        {driver ? (
          <Marker coordinate={toCoord(driver)} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverMarker}>
              <Text style={styles.driverGlyph}>🚗</Text>
            </View>
          </Marker>
        ) : null}

        <Polyline
          coordinates={routeCoords}
          strokeColor={colors.text}
          strokeWidth={3}
          lineDashPattern={live && !driver ? [6, 6] : undefined}
        />
      </MapView>

      {!driver && live ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Waiting for driver location…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  driverMarker: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
  },
  driverGlyph: { fontSize: 18 },
  badge: {
    position: 'absolute', top: spacing.sm, alignSelf: 'center',
    backgroundColor: colors.overlay, borderRadius: radius.pill,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
  },
  badgeText: { ...type.caption, color: '#FFFFFF' },
});