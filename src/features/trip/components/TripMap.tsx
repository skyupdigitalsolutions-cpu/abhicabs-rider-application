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

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Platform, Pressable } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { fareApi } from '../../../api/endpoints';
import { radius, spacing, type } from '../../../theme';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Dark map theme (Google Maps style array). Mutes the base map so the bright
 * blue route and markers pop, matching a modern ride-hailing look.
 */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5066' }] },
];

const ROUTE_BLUE = '#4C8DFF';
const ROUTE_OUTLINE = '#1B3A6B';

interface Props {
  pickup: LatLng;
  drop: LatLng;
  driver?: LatLng | null;
  /** Whether the trip is live (drives which leg of the route is emphasised). */
  live?: boolean;
  /** Start in tilted 3D (buildings in perspective). User can toggle. */
  threeD?: boolean;
  height?: number;
}

export function TripMap({ pickup, drop, driver, live = false, threeD = true, height = 260 }: Props) {
  const mapRef = useRef<MapView>(null);
  // 3D is on by default for live trips; user can flatten with the toggle.
  const [tilted, setTilted] = useState(threeD);

  // The road-following route points (from Directions). Falls back to null →
  // we draw the straight line until/unless a real route arrives.
  const [routePts, setRoutePts] = useState<LatLng[] | null>(null);

  const toCoord = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

  // Fetch the driving route once we know pickup + drop. Re-fetch only when the
  // endpoints change (not on every driver ping — the road path is the same).
  useEffect(() => {
    let cancelled = false;
    fareApi
      .route({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng })
      .then((r) => { if (!cancelled) setRoutePts(r.route.points); })
      .catch(() => { if (!cancelled) setRoutePts(null); });
    return () => { cancelled = true; };
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng]);

  // Camera control.
  //  • Driver known → follow the driver as pings arrive. In 3D this is a tilted
  //    chase view; in 2D a top-down follow. Either way it re-centres on every
  //    new driver position, so the car visibly tracks across the map.
  //  • No driver yet → fit pickup + drop in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (driver) {
      map.animateCamera(
        {
          center: toCoord(driver),
          pitch: tilted ? 55 : 0,
          heading: 0,
          zoom: 16,
          altitude: 800,
        },
        { duration: 800 },   // smooth glide toward the new position
      );
      return;
    }

    const coords = [pickup, drop].map(toCoord);
    if (coords.length >= 2) {
      map.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [tilted, pickup.lat, pickup.lng, drop.lat, drop.lng, driver?.lat, driver?.lng]);

  // The main pickup→drop line: the real road route if we have it, else straight.
  const roadCoords = (routePts && routePts.length >= 2 ? routePts : [pickup, drop]).map(toCoord);
  // A dashed connector from the driver to pickup while they're on the way.
  const driverLeg = live && driver ? [toCoord(driver), toCoord(pickup)] : null;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={DARK_MAP_STYLE}
        initialCamera={{
          center: toCoord(driver ?? pickup),
          pitch: tilted ? 55 : 0,
          heading: 0,
          zoom: 16,
          altitude: 1000,
        }}
        showsBuildings
        showsUserLocation={false}
        pitchEnabled
        toolbarEnabled={false}
        loadingEnabled
      >
        {/* Route drawn in two layers: a dark outline under a bright blue core,
            so the line reads clearly over the dark map — like Google Maps. */}
        <Polyline
          coordinates={roadCoords}
          strokeColor={ROUTE_OUTLINE}
          strokeWidth={9}
          lineCap="round"
          lineJoin="round"
        />
        <Polyline
          coordinates={roadCoords}
          strokeColor={ROUTE_BLUE}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />

        {/* Driver → pickup connector while en route. Dotted, muted. */}
        {driverLeg ? (
          <Polyline
            coordinates={driverLeg}
            strokeColor="#8A8A8A"
            strokeWidth={3}
            lineDashPattern={[2, 10]}
            lineCap="round"
          />
        ) : null}

        {/* Pickup — filled dot with a ring */}
        <Marker coordinate={toCoord(pickup)} anchor={{ x: 0.5, y: 0.5 }} title="Pickup">
          <View style={styles.pickupRing}>
            <View style={styles.pickupDot} />
          </View>
        </Marker>

        {/* Drop — teardrop pin */}
        <Marker coordinate={toCoord(drop)} anchor={{ x: 0.5, y: 1 }} title="Drop">
          <View style={styles.dropPin}>
            <Text style={styles.dropGlyph}>📍</Text>
          </View>
        </Marker>

        {/* Driver — car puck. Coordinate updates on each ping; the camera
            animation (below) provides the sense of smooth movement. */}
        {driver ? (
          <Marker coordinate={toCoord(driver)} title="Driver" anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={styles.driverMarker}>
              <Text style={styles.driverGlyph}>🚗</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>

      {!driver && live ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Waiting for driver location…</Text>
        </View>
      ) : null}

      {/* 2D / 3D toggle */}
      <Pressable style={styles.toggle} onPress={() => setTilted((t) => !t)}>
        <Text style={styles.toggleText}>{tilted ? '2D' : '3D'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#212121',
  },

  // Pickup: bright dot inside a translucent ring.
  pickupRing: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(76,141,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  pickupDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: ROUTE_BLUE, borderWidth: 2, borderColor: '#FFFFFF',
  },

  // Drop: teardrop pin glyph.
  dropPin: { alignItems: 'center', justifyContent: 'center' },
  dropGlyph: { fontSize: 34 },

  // Driver: dark circular puck with a car, white ring.
  driverMarker: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#111111',
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  driverGlyph: { fontSize: 20 },

  badge: {
    position: 'absolute', top: spacing.sm, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.pill,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
  },
  badgeText: { ...type.caption, color: '#FFFFFF' },

  toggle: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleText: { ...type.label, color: '#FFFFFF', fontWeight: '700' },
});