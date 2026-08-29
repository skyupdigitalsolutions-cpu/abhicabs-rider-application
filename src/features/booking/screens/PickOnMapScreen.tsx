/**
 * src/features/booking/screens/PickOnMapScreen.tsx
 *
 * Drop-a-pin location picker. The map moves under a fixed centre pin; wherever
 * the user settles the map, that centre point is the chosen location. When the
 * map stops moving we reverse-geocode the centre to show a human address, and
 * "Confirm" writes it into the booking draft as pickup or drop.
 *
 * Why a fixed centre pin instead of a draggable marker: it's the pattern every
 * major ride app uses — the whole map is the control surface, so the user's
 * thumb never has to land precisely on a tiny marker. One moving part, and it
 * works the same whether they pan, zoom, or fling.
 *
 * Requires a dev build (react-native-maps). Reverse-geocoding hits the backend
 * (/fares/reverse-geocode), so it needs MAPS_PROVIDER=google for real addresses.
 */

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useBookingDraft } from '../../../store/bookingDraft';
import { DEFAULT_CITY } from '../../../config/catalog';
import { fareApi } from '../../../api/endpoints';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import type { PickOnMapScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

export function PickOnMapScreen({ route, navigation }: PickOnMapScreenProps) {
  const { field } = route.params;
  const setPickup = useBookingDraft((s) => s.setPickup);
  const setDrop = useBookingDraft((s) => s.setDrop);
  const existing = useBookingDraft((s) => (field === 'pickup' ? s.pickup : s.drop));

  // Start over the existing choice if any, else the city centre.
  const initial: Region = {
    latitude: existing?.lat ?? DEFAULT_CITY.center.lat,
    longitude: existing?.lng ?? DEFAULT_CITY.center.lng,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  // The map's current centre — updated as the user pans; this IS the selection.
  const centre = useRef({ lat: initial.latitude, lng: initial.longitude });
  const [settled, setSettled] = useState(centre.current);
  const [address, setAddress] = useState<string>(existing?.label ?? '');
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Debounce the settled centre so a fling doesn't fire a reverse-geocode per
  // frame — one lookup when the map comes to rest.
  const debounced = useDebouncedValue(settled, 450);

  // Reverse-geocode whenever the debounced centre changes.
  const lookedUpFor = useRef<string>('');
  const key = `${debounced.lat.toFixed(5)},${debounced.lng.toFixed(5)}`;
  if (key !== lookedUpFor.current) {
    lookedUpFor.current = key;
    setLooking(true);
    fareApi
      .reverseGeocode(debounced.lat, debounced.lng)
      .then((r) => setAddress(r.location.formattedAddress))
      .catch(() => setAddress(`${debounced.lat.toFixed(5)}, ${debounced.lng.toFixed(5)}`))
      .finally(() => setLooking(false));
  }

  const onRegionChangeComplete = useCallback((r: Region) => {
    centre.current = { lat: r.latitude, lng: r.longitude };
    setSettled(centre.current);
  }, []);

  const onConfirm = () => {
    setConfirming(true);
    const place = {
      label: address || `${centre.current.lat.toFixed(5)}, ${centre.current.lng.toFixed(5)}`,
      lat: centre.current.lat,
      lng: centre.current.lng,
      placeId: null,
    };
    if (field === 'pickup') setPickup(place);
    else setDrop(place);
    navigation.goBack();
  };

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initial}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton
      />

      {/* Fixed centre pin — sits above the map, never moves. The little shadow
          dot anchors it so it reads as "this exact point". */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Text style={styles.pinGlyph}>📍</Text>
        <View style={styles.pinDot} />
      </View>

      {/* Bottom sheet: current address + confirm */}
      <View style={styles.sheet}>
        <Text style={styles.sheetLabel}>
          {field === 'pickup' ? 'Set pickup point' : 'Set destination'}
        </Text>
        <View style={styles.addrRow}>
          {looking ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <Text style={styles.addr} numberOfLines={2}>
              {address || 'Move the map to choose a spot'}
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.confirmBtn, (looking || confirming) && styles.confirmBtnDisabled]}
          onPress={onConfirm}
          disabled={looking || confirming}
        >
          <Text style={styles.confirmText}>
            {field === 'pickup' ? 'Confirm pickup' : 'Confirm destination'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  pinWrap: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  // Nudge the glyph up so its tip (not its centre) marks the point.
  pinGlyph: { fontSize: 40, marginBottom: 28 },
  pinDot: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, gap: spacing.md,
    borderTopWidth: 1, borderColor: colors.border,
  },
  sheetLabel: { ...type.label, color: colors.textMuted },
  addrRow: { minHeight: 44, justifyContent: 'center' },
  addr: { ...type.body, color: colors.text, fontSize: 16 },
  confirmBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmText: { ...type.label, color: colors.primaryText, fontSize: 16 },
});