/**
 * src/features/booking/screens/HomeScreen.tsx
 *
 * Full-screen map + draggable booking sheet + bottom tab bar (Ride/Rental/
 * Airport) that swaps the sheet content.
 *
 * PICKUP BY DRAG (Rapido style). The pin is fixed to the map and the map moves
 * under it — there is no button to press and no mode to enter. Wherever the
 * map settles, that point becomes the pickup and its address appears in the
 * chip above the sheet.
 *
 * The pin does NOT sit at the map's centre. The sheet covers the lower half of
 * the screen, so the centre is hidden behind it; a pin there would set the
 * pickup to somewhere the rider cannot see. It sits in the middle of the strip
 * of map that is actually visible, and the coordinate is read at that pixel.
 *
 * Searching still works and takes precedence: choosing a place moves the pin
 * to it rather than the other way round.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useNearbyCars } from '../nearby.api';
import { useUserLocation } from '../../../lib/useUserLocation';
import {
  DraggableSheet, SHEET_SNAP_HALF, SHEET_BANNER_HEIGHT, type SnapName,
} from '../components/DraggableSheet';
import { PromoStrip, type PromoMessage } from '../components/PromoStrip';
import { SharedMap } from '../components/BookingShared';
import { RideMode, RentalMode, AirportMode } from '../components/ServiceModes';
import { ExploreVehicles } from '../components/ExploreVehicles';
import { PromoBanner } from '../components/PromoBanner';
import { useBookingDraft } from '../../../store/bookingDraft';
import type { HomeScreenProps } from '../../../navigation/types';
import { DEFAULT_CITY } from '../../../config/catalog';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

type Tab = 'RIDE' | 'RENTAL' | 'AIRPORT';

/** Approximate height of the Account / Your trips pills, for pin placement. */
const TOP_PILL_H = 44;

/** Bottom padding inside the sheet, clearing the floating tab bar. */
const SHEET_BOTTOM_PAD = 140;

/** Gap between the booking card and the sheet edge, so the dark shows through. */
const CARD_GUTTER = 12;

/**
 * What the strip above the sheet cycles through.
 *
 * Hardcoded for now, and deliberately kept in one place so it is obvious where
 * to change it. These are marketing claims — "20% off on your first ride" is a
 * promise to the rider — so they should come from the backend once there is an
 * endpoint for live offers, rather than shipping in the bundle where changing
 * them needs an app release. Drop entries to show fewer; a single entry stops
 * the rotation entirely.
 */
const PROMOS: PromoMessage[] = [
  { kind: 'brand', label: 'ABHICABS' },
  { kind: 'offer', label: '20% off' },
  { kind: 'offer', label: '20% off on your first ride' },
];

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { coord: userLoc, status: locStatus, resolved: locResolved, refresh: refreshLocation } =
    useUserLocation(true); // live: the blue dot tracks the rider

  /**
   * The map ALWAYS gets a centre.
   *
   * HomeMap renders a placeholder when `centre` is null, so passing the raw
   * device location meant the home screen showed no map at all whenever the
   * location was unavailable — permission denied, no GPS fix indoors, an
   * emulator with no location set. That is why the map was missing here while
   * the trip map worked: the trip map takes its coordinates from the booking,
   * which is never null.
   *
   * Every other screen that needs coordinates already falls back this way
   * (PlaceSearchScreen, PickOnMapScreen, bookingDraft). The home screen was the
   * only one that did not. A map of the right city is far more useful than an
   * empty grey box, and the rider can still drag the pin or search.
   *
   * `usingFallback` is kept separate so the UI can be honest about it rather
   * than silently implying the default is the rider's actual position.
   */
  const usingFallback = !userLoc;
  const mapCentre = userLoc ?? DEFAULT_CITY.center;

  const nearby = useNearbyCars(userLoc);
  const setTripType = useBookingDraft((s) => s.setTripType);

  const [tab, setTab] = useState<Tab>('RIDE');
  const [sheetSnap, setSheetSnap] = useState<SnapName>('half');
  const [resolving, setResolving] = useState(false);

  const pickup = useBookingDraft((s) => s.pickup);
  const setPickup = useBookingDraft((s) => s.setPickup);

  /**
   * Where the pin sits, in px from the top of the map.
   *
   * Midway between the bottom of the top pills and the top of the sheet at its
   * default (half) position, minus the promo strip that sits above the sheet.
   * Deliberately fixed to the HALF snap rather than tracking the live drag:
   * a pin that slid as you dragged the sheet would silently change the pickup.
   */
  const pinOffsetY = useMemo(() => {
    const topChromeBottom = (StatusBar.currentHeight ?? 40) + 8 + TOP_PILL_H;
    const sheetTop = Math.round(SCREEN_H * SHEET_SNAP_HALF) - SHEET_BANNER_HEIGHT;
    return Math.round((topChromeBottom + sheetTop) / 2);
  }, []);

  /**
   * Where the map should put the pin. Changing this moves the map; leaving it
   * alone lets the rider drag freely.
   */
  const [followTarget, setFollowTarget] = useState<{ lat: number; lng: number } | null>(null);

  /** Coordinate the MAP last reported, so we can tell its updates from search's. */
  const lastFromMap = useRef<string | null>(null);
  const coordKey = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

  /**
   * The map settled somewhere new. Reverse geocoding has already run, so this
   * is a resolved place. placeId is null because it came from a coordinate,
   * not from a search result — downstream code keys off lat/lng anyway.
   */
  const onPinSettled = useCallback(
    (p: { lat: number; lng: number; label: string }) => {
      lastFromMap.current = coordKey(p);
      setPickup({ label: p.label, lat: p.lat, lng: p.lng, placeId: null });
    },
    [setPickup],
  );

  /**
   * Drop the pin on the rider as soon as we have a real fix — once only.
   *
   * This is the case the old rule got wrong. It followed `pickup` whenever
   * pickup existed, but the map sets pickup on its very first idle. If
   * location was still resolving at that moment, the pin settled on the city
   * fallback, pickup was written, and from then on pickup "won" forever — so
   * the rider's actual location arriving seconds later changed nothing.
   *
   * Guarded by a ref rather than by `pickup` being empty, so it fires exactly
   * once and never yanks the map back after the rider has started dragging.
   */
  const snappedToUser = useRef(false);
  useEffect(() => {
    if (snappedToUser.current || !userLoc) return;
    snappedToUser.current = true;
    setFollowTarget({ lat: userLoc.lat, lng: userLoc.lng });
  }, [userLoc]);

  /**
   * Follow a pickup that came from somewhere OTHER than the map — i.e. a
   * search result. Without the check the map would chase its own output:
   * drag -> pickup -> follow -> drag.
   */
  useEffect(() => {
    if (!pickup) return;
    const key = coordKey(pickup);
    if (lastFromMap.current === key) return;
    setFollowTarget({ lat: pickup.lat, lng: pickup.lng });
  }, [pickup?.lat, pickup?.lng]);

  /** Recentre on the rider — the standard "locate me" affordance. */
  const recentreOnUser = useCallback(() => {
    if (userLoc) setFollowTarget({ lat: userLoc.lat, lng: userLoc.lng });
    else refreshLocation();
  }, [userLoc, refreshLocation]);

  const mapFollow = followTarget ?? mapCentre;

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === 'RIDE') setTripType('ONE_WAY');
    else if (t === 'RENTAL') setTripType('HOURLY');
    else setTripType('AIRPORT');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Full-screen map — display only. */}
      <View style={styles.mapLayer}>
        <SharedMap
          centre={mapFollow}
          cars={nearby.data ?? []}
          // Only claim to be loading until location has actually settled. Once
          // it has, we are showing the fallback and there is nothing to wait for.
          loading={!locResolved && locStatus === 'loading'}
          height={SCREEN_H}
          approximate={usingFallback}
          onRetryLocation={locStatus === 'denied' ? undefined : refreshLocation}
          pickupMode
          // The dot must show the DEVICE, not the pin. Null while we only have
          // a city-level guess, so no dot is drawn rather than a wrong one.
          userLocation={usingFallback ? null : userLoc}
          pinOffsetY={pinOffsetY}
          onPickupChange={onPinSettled}
          onResolvingChange={setResolving}
        />
      </View>

      {/* Top pills — hidden when the sheet is expanded over them */}
      {sheetSnap !== 'full' ? (
        <View style={styles.topOverlay}>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate('Profile')} hitSlop={8}>
            <Text style={styles.topPillText}>☰  Account</Text>
          </Pressable>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate('Trips')} hitSlop={8}>
            <Text style={styles.topPillText}>Your trips</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Locate-me. Once the rider drags the pin away from themselves there
          is otherwise no way back short of searching their own address. */}
      {sheetSnap !== 'full' ? (
        <Pressable
          style={styles.locateBtn}
          onPress={recentreOnUser}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Centre the map on my location"
        >
          <Text style={styles.locateGlyph}>◎</Text>
        </Pressable>
      ) : null}

      {/* Resolved pickup address, sitting just above the sheet. Hidden when
          the sheet is expanded, since the map behind it is no longer visible
          and the pickup row inside the sheet shows the same text. */}
      {sheetSnap !== 'full' ? (
        <View style={styles.addressChip} pointerEvents="none">
          <View style={styles.addressDot} />
          {resolving ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={styles.addressText} numberOfLines={1}>
              {pickup?.label ?? 'Move the map to set your pickup'}
            </Text>
          )}
        </View>
      ) : null}

      <DraggableSheet
        onSnap={setSheetSnap}
        contentContainerStyle={styles.sheetContent}
        banner={<PromoStrip messages={PROMOS} />}
        // Dark surface so the booking form can sit on it as a white card with
        // all four corners rounded. The sheet itself can only round its top —
        // its bottom edge runs off the screen — so a rounded-bottom booking
        // area has to be a separate view on a contrasting background.
        surfaceStyle={styles.sheetSurface}
        showHandle={false}
      >
        <View style={styles.bookingCard}>
          {tab === 'RIDE' ? <RideMode navigation={navigation} /> : null}
          {tab === 'RENTAL' ? <RentalMode navigation={navigation} /> : null}
          {tab === 'AIRPORT' ? <AirportMode navigation={navigation} /> : null}
        </View>

        {/* Below the booking card, so it is reachable by expanding the sheet
            without ever competing with the fields for attention. */}
        <ExploreVehicles
          onViewAll={() => navigation.navigate('Vehicles')}
          edgeInset={CARD_GUTTER}
          bottomInset={SHEET_BOTTOM_PAD}
          footer={
            <PromoBanner
              title="Book Intercity"
              subtitle={'Easy weekend trips\nto towns near by'}
              // Add artwork at assets/promo/intercity.png, then:
              //   image={require('../../../../assets/promo/intercity.png')}
              image={require('../../../../assets/promo/banner-car.png')}
              glyph="🚗"
              onPress={() => {
                // Intercity is a long one-way, so this drops the rider into
                // the Ride tab already in ONE_WAY rather than opening a
                // separate flow that would need its own quote path.
                selectTab('RIDE');
                setTripType('ONE_WAY');
              }}
            />
          }
        />
      </DraggableSheet>

      <View style={styles.tabBar}>
        <TabButton icon="🚗" label="Ride" active={tab === 'RIDE'} onPress={() => selectTab('RIDE')} />
        <TabButton icon="⏱️" label="Rental" active={tab === 'RENTAL'} onPress={() => selectTab('RENTAL')} />
        <TabButton icon="✈️" label="Airport" active={tab === 'AIRPORT'} onPress={() => selectTab('AIRPORT')} />
      </View>
    </View>
  );
}

function TabButton(props: { icon: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.tabBtn} onPress={props.onPress}>
      <Text style={[styles.tabIcon, props.active && styles.tabIconActive]}>{props.icon}</Text>
      <Text style={[styles.tabLabel, props.active && styles.tabLabelActive]}>{props.label}</Text>
      {props.active ? <View style={styles.tabUnderline} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  topOverlay: {
    position: 'absolute', top: (StatusBar.currentHeight ?? 40) + 8, left: spacing.lg, right: spacing.lg,
    flexDirection: 'row', justifyContent: 'space-between', zIndex: 10,
  },
  topPill: {
    backgroundColor: '#FFFFFF', borderRadius: radius.pill,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  topPillText: { ...type.label, color: colors.text },

  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    // Parked just above the address chip, which sits above the sheet.
    bottom: SCREEN_H - Math.round(SCREEN_H * SHEET_SNAP_HALF) + SHEET_BANNER_HEIGHT + 72,
    zIndex: 15,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  locateGlyph: { fontSize: 22, color: colors.text, lineHeight: 26 },

  addressChip: {
    position: 'absolute',
    left: spacing.lg, right: spacing.lg,
    // Parked just above the sheet's promo strip at the half snap.
    bottom: SCREEN_H - Math.round(SCREEN_H * SHEET_SNAP_HALF) + SHEET_BANNER_HEIGHT + spacing.md,
    zIndex: 15,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: '#FFFFFF', borderRadius: radius.pill,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  addressDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 4, borderColor: '#1E8E3E', backgroundColor: '#FFFFFF',
  },
  addressText: { ...type.label, flex: 1, color: colors.text },

  // The sheet is dark; the white card carries its own padding, so this only
  // needs the gutter that lets the dark show around it.
  sheetSurface: { backgroundColor: colors.text },
  sheetContent: {
    paddingHorizontal: CARD_GUTTER,
    // Tight to the top now the 40px handle row is gone. Not tighter than
    // this, though: the sheet's top corners have a 28px radius, so near the
    // very top its edges curve inward by more than the 12px gutter and the
    // card's corners would visibly poke outside them. At 10px the corner is
    // inset 6.6px, leaving the card ~5px of clearance.
    paddingTop: 10,
    paddingBottom: SHEET_BOTTOM_PAD,
  },
  bookingCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xl,
  },
  brandStrip: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.xs },
  brandText: { ...type.display, fontSize: 22, color: colors.primaryText, fontWeight: '800' },

  tabBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingBottom: spacing.lg, paddingTop: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 16,
    zIndex: 20,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabLabel: { ...type.caption, color: colors.textMuted },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
  tabUnderline: { width: 20, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginTop: 2 },
});