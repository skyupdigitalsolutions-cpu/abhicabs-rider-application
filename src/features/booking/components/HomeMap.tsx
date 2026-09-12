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
 * ---------------------------------------------------------------------------
 * WHY THIS USES THE MAPS JAVASCRIPT API IN A WEBVIEW, NOT react-native-maps
 * ---------------------------------------------------------------------------
 * The native MapView rendered as a blank white box here while the same library
 * worked on the trip screen. Rather than keep guessing at the native layer, the
 * home map is now plain Google Maps JS inside a WebView: it is the same Google
 * tiles, but the failure modes are visible instead of silent.
 *
 * The important part is `gm_authFailure`. When a Maps JS key is missing, has
 * the wrong APIs enabled, or is referrer-restricted to somewhere else, Google
 * calls that hook — so an unusable key now shows a readable message on screen
 * instead of a white rectangle. That is the single biggest reason to prefer
 * this over the native view for a surface that has already failed once.
 *
 * Trade-offs, honestly: a WebView costs more memory than a native map, markers
 * animate less smoothly, and the very first paint is slower because the JS API
 * has to be fetched. For a mostly-static home map showing a handful of car dots
 * that is a fair price. The trip screen still uses react-native-maps, where it
 * demonstrably works and the live-tracking performance matters more.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { CarDot } from '../nearby.api';
import { fareApi } from '../../../api/endpoints';
import { env } from '../../../config/env';
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
  /** When true, show the fixed "Pickup Point" pin and report what is under it. */
  pickupMode?: boolean;
  onPickupChange?: (p: PickupChoice) => void;
  /**
   * Distance in px from the top of the map to the pin's tip.
   *
   * The sheet covers the lower half of the screen, so the map's own centre is
   * hidden behind it. The pin sits in the middle of the VISIBLE strip instead,
   * and the coordinate is read at that pixel rather than at the centre.
   * Defaults to the map's centre when not supplied.
   */
  pinOffsetY?: number;
  /** Reports whether an address lookup is in flight, for the caller's chip. */
  onResolvingChange?: (busy: boolean) => void;
  /**
   * The rider's ACTUAL position, for the blue dot.
   *
   * Kept separate from `centre` on purpose. Once the pickup picker is on,
   * `centre` is the pickup — which the rider drags away from themselves. The
   * dot must keep pointing at the device, not at the pin, or it stops meaning
   * anything. Null when the location is unknown or only a city-level guess,
   * in which case no dot is drawn at all rather than a misleading one.
   */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * The centre is a city-level default rather than the rider's real position.
   * The map still draws — an empty grey box helps nobody — but we must not
   * imply the blue "you are here" dot is accurate, and we say so in the pill.
   */
  approximate?: boolean;
  /** Shown as a tappable retry when a fresh location attempt might work. */
  onRetryLocation?: () => void;
}

/**
 * Height of the badge + pin stack. The wrapper is anchored so the pin's TIP
 * lands exactly on the pin row — the tip is what the coordinate refers to, so
 * centring the whole stack there would offset the pickup by half its height.
 */
const PIN_STACK_H = 96;

/** Messages the WebView document sends back to React Native. */
type MapMessage =
  | { type: 'ready' }
  | { type: 'idle'; lat: number; lng: number }
  | { type: 'authFailure' }
  | { type: 'loadError'; message: string };

/**
 * The map document.
 *
 * Built once and kept static: the centre, the car markers and the user dot are
 * all pushed in later with injectJavaScript. Rebuilding this string on every
 * prop change would reload the whole map and throw away the user's pan, which
 * is exactly what a pickup picker must not do.
 */
function buildHtml(key: string, lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map { height: 100%; margin: 0; padding: 0; background: #E9EDF2; }
      /* Google's own controls are replaced by native overlays drawn above. */
      .gm-style-cc, .gmnoprint a, .gm-style a[href^="https://maps.google"] { display: none !important; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var post = function (payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      };

      // Google calls this when the key is missing, unauthorised for the Maps
      // JavaScript API, or blocked by a referrer restriction. Without it the
      // page simply stays grey and there is nothing to debug.
      window.gm_authFailure = function () { post({ type: 'authFailure' }); };

      window.onerror = function (message) { post({ type: 'loadError', message: String(message) }); };

      var map = null;
      var carMarkers = [];
      var userMarker = null;

      // Pixel row (from the top of the map) that the pickup pin occupies.
      // The pin is NOT at the map's centre: the booking sheet covers the lower
      // half of the screen, so the true centre sits behind it. Reading the
      // centre would set the pickup to a place the rider cannot see.
      var pinY = null;
      var projOverlay = null;

      function coordAtPin() {
        var c = map.getCenter();
        var fallback = { lat: c.lat(), lng: c.lng() };
        if (pinY === null || !projOverlay) return fallback;
        var proj = projOverlay.getProjection();
        if (!proj) return fallback;
        var el = document.getElementById('map');
        var ll = proj.fromContainerPixelToLatLng(
          new google.maps.Point(el.offsetWidth / 2, pinY)
        );
        return ll ? { lat: ll.lat(), lng: ll.lng() } : fallback;
      }

      window.__initMap = function () {
        map = new google.maps.Map(document.getElementById('map'), {
          center: { lat: ${lat}, lng: ${lng} },
          zoom: 15,
          disableDefaultUI: true,
          clickableIcons: false,
          // 'greedy' so a one-finger drag pans the map. The default on touch
          // requires two fingers, which would make the pickup picker feel broken.
          gestureHandling: 'greedy',
        });

        // An empty overlay exists purely to expose MapCanvasProjection, which
        // is the only supported way to turn a pixel into a LatLng.
        projOverlay = new google.maps.OverlayView();
        projOverlay.draw = function () {};
        projOverlay.setMap(map);

        map.addListener('idle', function () {
          // Before pinY arrives, coordAtPin() would fall back to the map
          // CENTRE — which is behind the sheet. Staying quiet until the pin
          // row is known stops the very first idle setting a bogus pickup.
          if (pinY === null) return;
          var p = coordAtPin();
          post({ type: 'idle', lat: p.lat, lng: p.lng });
        });

        post({ type: 'ready' });
      };

      window.__setPinY = function (y) {
        pinY = y;
        // The idle that would have reported this was suppressed above, so
        // emit once now that we know where the pin is.
        if (y !== null && map) {
          var p = coordAtPin();
          post({ type: 'idle', lat: p.lat, lng: p.lng });
        }
      };

      /**
       * Move the map so the PIN — not the map centre — lands on lat/lng.
       * Panning to the raw coordinate would put it behind the sheet.
       */
      window.__setPinTo = function (lat, lng, animate) {
        if (!map) return;
        if (pinY === null || !projOverlay || !projOverlay.getProjection()) {
          map.setCenter({ lat: lat, lng: lng });
          return;
        }
        var el = document.getElementById('map');
        var dy = pinY - el.offsetHeight / 2;
        var proj = projOverlay.getProjection();
        var target = proj.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
        var wanted = new google.maps.Point(target.x, target.y - dy);
        var ll = proj.fromContainerPixelToLatLng(wanted);
        if (!ll) { map.setCenter({ lat: lat, lng: lng }); return; }
        if (animate) map.panTo(ll); else map.setCenter(ll);
      };

      // Recentre without a reload, so a pan in progress is never yanked away.
      window.__setCentre = function (lat, lng, animate) {
        if (!map) return;
        if (animate) map.panTo({ lat: lat, lng: lng });
        else map.setCenter({ lat: lat, lng: lng });
      };

      window.__setUser = function (lat, lng, show) {
        if (!map) return;
        if (!show) {
          if (userMarker) { userMarker.setMap(null); userMarker = null; }
          return;
        }
        var pos = { lat: lat, lng: lng };
        if (userMarker) { userMarker.setPosition(pos); return; }
        userMarker = new google.maps.Marker({
          map: map,
          position: pos,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#1A73E8',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
          },
          zIndex: 10,
        });
      };

      window.__setCars = function (cars) {
        if (!map) return;
        for (var i = 0; i < carMarkers.length; i++) carMarkers[i].setMap(null);
        carMarkers = [];
        for (var j = 0; j < cars.length; j++) {
          carMarkers.push(new google.maps.Marker({
            map: map,
            position: { lat: cars[j].lat, lng: cars[j].lng },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: '#F5B301',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          }));
        }
      };
    </script>
    <script
      async
      defer
      src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__initMap"
      onerror="window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loadError', message: 'Could not reach maps.googleapis.com' }))"
    ></script>
  </body>
</html>`;
}

export function HomeMap({
  centre, cars, height = 260, loading = false, fullBleed = false,
  pickupMode = false, onPickupChange, pinOffsetY, onResolvingChange,
  approximate = false, onRetryLocation, userLocation,
}: Props) {
  const webRef = useRef<WebView>(null);

  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Pickup-mode state: where the map has settled and what that address is.
  const [address, setAddress] = useState('');
  const [looking, setLooking] = useState(false);
  const lookedUpFor = useRef('');

  // The map document is built ONCE, from the first non-null centre. Later
  // centre changes are injected, never re-rendered — see buildHtml.
  const firstCentre = useRef(centre);
  if (!firstCentre.current && centre) firstCentre.current = centre;

  const html = useMemo(() => {
    const c = firstCentre.current;
    if (!c) return null;
    return buildHtml(env.mapsJsKey, c.lat, c.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstCentre.current, env.mapsJsKey]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js}; true;`);
  }, []);

  const pinY = pinOffsetY ?? Math.round(height / 2);

  useEffect(() => {
    if (!ready) return;
    inject(`window.__setPinY(${pickupMode ? pinY : 'null'})`);
  }, [ready, pinY, pickupMode, inject]);

  /**
   * Follow `centre` when it changes.
   *
   * In pickup mode this aligns the PIN with the coordinate, not the map centre
   * — otherwise selecting a place from search would drop it behind the sheet.
   *
   * `settledOn` stops the feedback loop: every pan raises idle, which sets the
   * pickup, which changes `centre`, which would pan the map again. We remember
   * the coordinate we last reported and skip re-centring on it.
   */
  const settledOn = useRef<string | null>(null);
  const skipNextIdle = useRef(false);

  useEffect(() => {
    if (!ready || !centre) return;
    const key = `${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`;
    if (settledOn.current === key) return;
    settledOn.current = key;

    // A pan we asked for lands on a place the caller already has a good label
    // for — typically a search result like "Esteem Gardenia". Re-geocoding it
    // would replace that name with a generic formatted address, so the idle
    // it produces is ignored once.
    skipNextIdle.current = true;
    lookedUpFor.current = key;

    if (pickupMode) inject(`window.__setPinTo(${centre.lat}, ${centre.lng}, true)`);
    else inject(`window.__setCentre(${centre.lat}, ${centre.lng}, true)`);
  }, [ready, centre?.lat, centre?.lng, pickupMode, inject]);

  /**
   * The blue "you are here" dot.
   *
   * Driven by userLocation, NOT by centre: with the picker on, centre is
   * wherever the rider has dragged the pin, and a dot there would claim they
   * had moved. Shown whenever a real position is known — including while
   * picking, since seeing yourself is how you judge where you are dragging to.
   */
  useEffect(() => {
    if (!ready) return;
    if (!userLocation || approximate) {
      inject('window.__setUser(0, 0, false)');
      return;
    }
    inject(`window.__setUser(${userLocation.lat}, ${userLocation.lng}, true)`);
  }, [ready, userLocation?.lat, userLocation?.lng, approximate, inject]);

  // Cars stay visible while picking: the pickup pin is now always on, so
  // hiding them would mean never showing nearby cabs at all.
  useEffect(() => {
    if (!ready) return;
    inject(`window.__setCars(${JSON.stringify(cars.map((c) => ({ lat: c.lat, lng: c.lng })))})`);
  }, [ready, cars, inject]);

  /**
   * The map settled — resolve whatever is under the pin to an address.
   *
   * Keyed to 5 decimal places (about a metre), so a pan that ends where it
   * started costs nothing. `settledOn` is stamped with the same key BEFORE the
   * lookup so the resulting pickup update does not bounce the map back.
   */
  const onIdle = useCallback(
    (lat: number, lng: number) => {
      if (!pickupMode) return;

      if (skipNextIdle.current) {
        skipNextIdle.current = false;
        return;
      }

      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (key === lookedUpFor.current) return;
      lookedUpFor.current = key;
      settledOn.current = key;

      setLooking(true);
      onResolvingChange?.(true);

      fareApi
        .reverseGeocode(lat, lng)
        .then((res) => {
          const label = res.location.formattedAddress;
          setAddress(label);
          onPickupChange?.({ lat, lng, label });
        })
        .catch(() => {
          // Falling back to raw coordinates keeps the pickup usable when the
          // geocoder is down — the booking still has a valid lat/lng.
          const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setAddress(label);
          onPickupChange?.({ lat, lng, label });
        })
        .finally(() => {
          setLooking(false);
          onResolvingChange?.(false);
        });
    },
    [pickupMode, onPickupChange, onResolvingChange],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: MapMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data) as MapMessage;
      } catch {
        return;
      }

      if (msg.type === 'ready') setReady(true);
      else if (msg.type === 'idle') onIdle(msg.lat, msg.lng);
      else if (msg.type === 'authFailure') {
        setFailure(
          'Google rejected the maps key. Enable the Maps JavaScript API and allow this app\u2019s referrer.',
        );
      } else if (msg.type === 'loadError') setFailure(msg.message);
    },
    [onIdle],
  );

  /* --- no centre yet, or no key configured --------------------------- */

  if (!centre || !html) {
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

  if (!env.mapsJsKey) {
    return (
      <View style={[styles.wrap, styles.placeholder, fullBleed && styles.fullBleed, { height }]}>
        <Text style={styles.errorTitle}>Map unavailable</Text>
        <Text style={styles.placeholderText}>
          No Google Maps key configured. Set EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, fullBleed && styles.fullBleed, { height }]}>
      <WebView
        ref={webRef}
        style={StyleSheet.absoluteFill}
        // baseUrl sets the document origin, which Google reads as the HTTP
        // referer. That lets the Maps JS key be referrer-restricted to this
        // value instead of being left wide open.
        source={{ html, baseUrl: env.mapsWebOrigin }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // Without this the map is a blank white box on Android: the WebView
        // paints before the tiles arrive and never composites them.
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        // The map is a control surface, not a scrollable page.
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        onError={(e) => setFailure(e.nativeEvent.description || 'WebView failed to load')}
        onHttpError={(e) => setFailure(`Map request failed (HTTP ${e.nativeEvent.statusCode})`)}
      />

      {/* Until Google calls back, cover the WebView so the user never sees a
          bare white rectangle and wonder whether the app is broken. */}
      {!ready && !failure ? (
        <View style={styles.loadingCover}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {failure ? (
        <View style={styles.loadingCover}>
          <Text style={styles.errorTitle}>Map unavailable</Text>
          <Text style={styles.placeholderText}>{failure}</Text>
        </View>
      ) : null}

      {/* Fixed centre pin — the pickup picker. Sits above the map, never moves. */}
      {pickupMode ? (
        <View
          pointerEvents="none"
          style={[styles.centerPinWrap, { top: pinY - PIN_STACK_H, height: PIN_STACK_H }]}
        >
          <View style={styles.pickupBadge}>
            <Text style={styles.pickupBadgeText}>Pickup Point</Text>
          </View>
          <Text style={styles.pinGlyph}>📍</Text>
          <View style={styles.pinDot} />
        </View>
      ) : null}

      {/* Top pill: cabs nearby (normal) OR the resolved pickup address (picking).
          When the centre is a fallback we say so and offer a retry, rather than
          reporting "cabs nearby" about a city the rider may not be in. */}
      <Pressable
        style={[styles.pill, approximate && styles.pillWarn]}
        onPress={approximate ? onRetryLocation : undefined}
        disabled={!approximate || !onRetryLocation}
      >
        {approximate ? (
          <Text style={styles.pillText} numberOfLines={1}>
            {onRetryLocation
              ? 'Approximate area · Tap to retry location'
              : 'Approximate area · Enable location in Settings'}
          </Text>
        ) : (
          <Text style={styles.pillText}>
            {cars.length > 0 ? `${cars.length} cab${cars.length > 1 ? 's' : ''} nearby` : 'Finding cabs near you…'}
          </Text>
        )}
      </Pressable>
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
  errorTitle: { ...type.label, color: colors.text, fontWeight: '700', marginBottom: spacing.sm },

  loadingCover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg, backgroundColor: colors.surfaceAlt,
  },

  // Fixed centre pin
  centerPinWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', justifyContent: 'flex-end',
  },
  pickupBadge: {
    backgroundColor: '#2E7D32', borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: 4,
  },
  pickupBadgeText: { ...type.label, color: '#FFFFFF', fontWeight: '700' },
  pinGlyph: { fontSize: 40 },
  // Shadow under the pin tip, marking the exact point being selected.
  pinDot: {
    width: 10, height: 10, borderRadius: 5, marginTop: -6,
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
  pillWarn: { maxWidth: '92%', backgroundColor: '#B26A00' },
});