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

/**
 * Approximate distance (metres) from a point to the nearest segment of a
 * polyline. Uses an equirectangular projection to local metres — plenty
 * accurate over the short spans between route points, and cheap enough to run
 * on every ping. This is what lets us tell "still on the road we drew" from
 * "took a different road" without calling any API.
 */
function metresFromPolyline(p: { lat: number; lng: number }, line: { lat: number; lng: number }[]): number {
  const R = 111_320; // metres per degree latitude
  const latRad = (p.lat * Math.PI) / 180;
  const mx = (lng: number) => lng * R * Math.cos(latRad);
  const my = (lat: number) => lat * R;
  const px = mx(p.lng);
  const py = my(p.lat);

  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const prev = line[i - 1];
    const curr = line[i];
    if (!prev || !curr) continue;
    const ax = mx(prev.lng), ay = my(prev.lat);
    const bx = mx(curr.lng), by = my(curr.lat);
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    // Project point onto the segment, clamped to its ends.
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d < best) best = d;
  }
  return best;
}

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

  // Origin for the route: while live with a known driver, route FROM the driver
  // to the drop (so the line always starts at the cab). Otherwise pickup→drop.
  const routeOrigin = live && driver ? driver : pickup;

  // Guards so we don't spam the paid Directions API:
  //  • lastRouteFrom  — where we last fetched a route from
  //  • offRouteHits   — consecutive pings the driver has been off the line
  // We only re-fetch when the driver has genuinely deviated, not every ping.
  const lastRouteFrom = useRef<LatLng | null>(null);
  const offRouteHits = useRef(0);
  const DEVIATE_M = 60;        // metres off the line that counts as "off route"
  const REROUTE_AFTER = 2;     // consecutive off-route pings before we re-fetch

  const fetchRoute = (from: LatLng, to: LatLng) => {
    lastRouteFrom.current = from;
    fareApi
      .route({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng })
      .then((r) => setRoutePts(r.route.points))
      .catch(() => { /* keep the old line; never blank the map on a failed re-fetch */ });
  };

  // Initial route: fetch once when we first have endpoints (or the driver first
  // appears). Endpoint changes (a new booking) also refetch.
  useEffect(() => {
    fetchRoute(routeOrigin, drop);
    offRouteHits.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng]);

  // Deviation check: on each driver move, measure how far the driver is from the
  // drawn route. If they're off it for REROUTE_AFTER pings running, re-fetch the
  // route from their current spot — this is the "driver took a shortcut" case.
  useEffect(() => {
    if (!live || !driver || !routePts || routePts.length < 2) return;
    const offBy = metresFromPolyline(driver, routePts);
    if (offBy > DEVIATE_M) {
      offRouteHits.current += 1;
      if (offRouteHits.current >= REROUTE_AFTER) {
        offRouteHits.current = 0;
        fetchRoute(driver, drop);
      }
    } else {
      offRouteHits.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.lat, driver?.lng]);

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