/**
 * src/features/booking/screens/HomeScreen.tsx
 *
 * Full-screen map + draggable booking sheet + bottom tab bar (Ride/Rental/
 * Airport) that swaps the sheet content.
 *
 * Pickup-by-map (Rapido style): tapping "Set pickup on map" enters an explicit
 * PICKING state — the sheet drops to peek, the map shows a fixed "Pickup Point"
 * pin, and a Confirm button commits whatever's under the pin as the pickup. It
 * can be re-entered anytime to change the pickup, and searching still works too.
 */

import { useState } from 'react';
import {
  Dimensions, Pressable, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useNearbyCars } from '../nearby.api';
import { useUserLocation } from '../../../lib/useUserLocation';
import { DraggableSheet, type SnapName } from '../components/DraggableSheet';
import { SharedMap } from '../components/BookingShared';
import { RideMode, RentalMode, AirportMode } from '../components/ServiceModes';
import { useBookingDraft } from '../../../store/bookingDraft';
import type { HomeScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

type Tab = 'RIDE' | 'RENTAL' | 'AIRPORT';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { coord: userLoc, status: locStatus } = useUserLocation();
  const nearby = useNearbyCars(userLoc);
  const setTripType = useBookingDraft((s) => s.setTripType);
  const setPickup = useBookingDraft((s) => s.setPickup);

  const [tab, setTab] = useState<Tab>('RIDE');
  const [sheetSnap, setSheetSnap] = useState<SnapName>('half');

  // Explicit map-pickup picking state.
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<{ lat: number; lng: number; label: string } | null>(null);

  const selectTab = (t: Tab) => {
    setTab(t);
    if (t === 'RIDE') setTripType('ONE_WAY');
    else if (t === 'RENTAL') setTripType('HOURLY');
    else setTripType('AIRPORT');
  };

  const startPicking = () => {
    setPicking(true);
  };

  const confirmPickup = () => {
    if (pending) {
      setPickup({ label: pending.label, lat: pending.lat, lng: pending.lng, placeId: null });
    }
    setPicking(false);
    setSheetSnap('half');
  };

  const cancelPicking = () => {
    setPicking(false);
    setSheetSnap('half');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Full-screen map. In picking mode it becomes the pickup picker. */}
      <View style={styles.mapLayer}>
        <SharedMap
          centre={userLoc}
          cars={nearby.data ?? []}
          loading={locStatus === 'loading'}
          height={SCREEN_H}
          pickupMode={picking}
          onPickupChange={setPending}
        />
      </View>

      {/* Top pills — hidden while picking or when sheet is full */}
      {!picking && sheetSnap !== 'full' ? (
        <View style={styles.topOverlay}>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate('Profile')} hitSlop={8}>
            <Text style={styles.topPillText}>☰  Account</Text>
          </Pressable>
          <Pressable style={styles.topPill} onPress={() => navigation.navigate('Trips')} hitSlop={8}>
            <Text style={styles.topPillText}>Your trips</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Picking mode: a Confirm / Cancel bar floats above the bottom */}
      {picking ? (
        <View style={styles.confirmBar}>
          <Pressable style={styles.cancelBtn} onPress={cancelPicking}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={confirmPickup} disabled={!pending}>
            <Text style={styles.confirmText}>Confirm pickup</Text>
          </Pressable>
        </View>
      ) : null}

      {/* The sheet + bottom tabs are hidden while picking, to keep the map clear */}
      {!picking ? (
        <>
          <DraggableSheet onSnap={setSheetSnap} contentContainerStyle={styles.sheetContent}>
            

            {/* Set-pickup-on-map entry */}
            <Pressable style={styles.mapPickBtn} onPress={startPicking}>
              <Text style={styles.mapPickText}>📍  Set pickup on map</Text>
            </Pressable>

            {tab === 'RIDE' ? <RideMode navigation={navigation} /> : null}
            {tab === 'RENTAL' ? <RentalMode navigation={navigation} /> : null}
            {tab === 'AIRPORT' ? <AirportMode navigation={navigation} /> : null}
          </DraggableSheet>

          <View style={styles.tabBar}>
            <TabButton icon="🚗" label="Ride" active={tab === 'RIDE'} onPress={() => selectTab('RIDE')} />
            <TabButton icon="⏱️" label="Rental" active={tab === 'RENTAL'} onPress={() => selectTab('RENTAL')} />
            <TabButton icon="✈️" label="Airport" active={tab === 'AIRPORT'} onPress={() => selectTab('AIRPORT')} />
          </View>
        </>
      ) : null}
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

  confirmBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
    flexDirection: 'row', gap: spacing.md, padding: spacing.xl,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: colors.border,
  },
  cancelBtn: {
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { ...type.label, color: colors.text },
  confirmBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  confirmText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  sheetContent: { padding: spacing.xl, paddingTop: spacing.sm, paddingBottom: 140, gap: spacing.lg },
  brandStrip: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.xs },
  brandText: { ...type.display, fontSize: 22, color: colors.primaryText, fontWeight: '800' },

  mapPickBtn: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  mapPickText: { ...type.label, color: colors.primary },

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