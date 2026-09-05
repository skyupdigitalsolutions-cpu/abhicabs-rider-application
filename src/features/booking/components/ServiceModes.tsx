/**
 * src/features/booking/components/ServiceModes.tsx
 *
 * The three service bodies that swap inside the home sheet when the bottom tab
 * changes. Each is thin: it composes the shared pieces (WhereTo, RouteCard,
 * DateRow, SearchButton) plus only its own unique control.
 *
 *   Ride    — one-way / round-trip toggle, pickup + drop, optional return date
 *   Rental  — pickup only, package / flexible-hours picker
 *   Airport — pickup + drop, flight number
 */

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useRentalPackages } from '../api';
import type { TripType, RentalPackage } from '../../../types/domain';
import {
  WhereToBar, RouteCard, PlaceRow, Divider, DateRow, DateCard, DateSpacer, SearchButton,
} from './BookingShared';
import { colors, radius, spacing, type } from '../../../theme';

type Nav = { navigate: (screen: string, params?: object) => void };

/* --------------------------------- Ride ------------------------------------ */

export function RideMode({ navigation }: { navigation: Nav }) {
  const {
    pickup, drop, tripType, pickupAt, returnAt,
    setTripType, setPickupAt, setReturnAt,
  } = useBookingDraft();

  const showReturn = tripType === 'ROUND_TRIP';
  const canContinue = Boolean(pickup && drop);

  return (
    <View style={styles.body}>
      <SubToggle
        options={[{ key: 'ONE_WAY', label: 'One way' }, { key: 'ROUND_TRIP', label: 'Round trip' }]}
        value={tripType === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY'}
        onChange={setTripType}
      />

      <WhereToBar
        label={drop?.label ?? pickup?.label ?? 'Where to?'}
        onPress={() => navigation.navigate('PlaceSearch', { field: pickup ? 'drop' : 'pickup' })}
      />

      <RouteCard>
        <PlaceRow kind="pickup" label="Pickup" value={pickup?.label ?? null} placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })} />
        <Divider />
        <PlaceRow kind="drop" label="Drop" value={drop?.label ?? null} placeholder="Where to?"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })} />
      </RouteCard>

      <DateRow>
        <DateCard label="Trip Start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} />
        {showReturn ? (
          <DateCard label="Trip End" value={returnAt ?? pickupAt} onChange={(iso) => setReturnAt(iso)} minimumDate={new Date(pickupAt)} />
        ) : <DateSpacer />}
      </DateRow>

      <SearchButton disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />
    </View>
  );
}

/* -------------------------------- Rental ----------------------------------- */

export function RentalMode({ navigation }: { navigation: Nav }) {
  const {
    cityId, pickup, pickupAt, rentalPackageId, rentalHours,
    setTripType, setPickupAt, setRentalPackageId, setRentalHours,
  } = useBookingDraft();

  // Ensure the wire trip type is HOURLY while this tab is active.
  useEffect(() => {
    if (useBookingDraft.getState().tripType !== 'HOURLY') setTripType('HOURLY');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = Boolean(rentalPackageId || rentalHours);
  const canContinue = Boolean(pickup) && ready;

  return (
    <View style={styles.body}>
      <WhereToBar
        label={pickup?.label ?? 'Pickup point'}
        onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
      />

      <RouteCard>
        <PlaceRow kind="pickup" label="From" value={pickup?.label ?? null} placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })} />
      </RouteCard>

      <DateRow>
        <DateCard label="Trip Start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} />
        <DateSpacer />
      </DateRow>

      <LocalRentalPicker
        cityId={cityId}
        selectedPackageId={rentalPackageId}
        selectedHours={rentalHours}
        onPickPackage={setRentalPackageId}
        onPickHours={setRentalHours}
      />

      <SearchButton disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />
    </View>
  );
}

/* -------------------------------- Airport ---------------------------------- */

export function AirportMode({ navigation }: { navigation: Nav }) {
  const {
    pickup, drop, pickupAt, flightNumber,
    setTripType, setPickupAt, setFlightNumber,
  } = useBookingDraft();

  useEffect(() => {
    if (useBookingDraft.getState().tripType !== 'AIRPORT') setTripType('AIRPORT');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = Boolean(pickup && drop);

  return (
    <View style={styles.body}>
      <WhereToBar
        label={drop?.label ?? pickup?.label ?? 'Where to?'}
        onPress={() => navigation.navigate('PlaceSearch', { field: pickup ? 'drop' : 'pickup' })}
      />

      <RouteCard>
        <PlaceRow kind="pickup" label="Pickup" value={pickup?.label ?? null} placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })} />
        <Divider />
        <PlaceRow kind="drop" label="Drop" value={drop?.label ?? null} placeholder="Airport / destination"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })} />
      </RouteCard>

      <View style={styles.flightCard}>
        <Text style={styles.flightLabel}>Flight number (optional)</Text>
        <TextInput
          style={styles.flightInput}
          placeholder="e.g. 6E 2345"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          value={flightNumber ?? ''}
          onChangeText={(t) => setFlightNumber(t || null)}
        />
      </View>

      <DateRow>
        <DateCard label="Trip Start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} />
        <DateSpacer />
      </DateRow>

      <SearchButton disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />
    </View>
  );
}

/* ----------------------------- shared subviews ----------------------------- */

function SubToggle(props: { options: { key: TripType; label: string }[]; value: TripType; onChange: (t: TripType) => void }) {
  return (
    <View style={styles.toggle}>
      {props.options.map((o) => {
        const active = props.value === o.key;
        return (
          <Pressable key={o.key} style={[styles.toggleOption, active && styles.toggleOptionActive]} onPress={() => props.onChange(o.key)}>
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LocalRentalPicker(props: {
  cityId: number;
  selectedPackageId: number | null;
  selectedHours: number | null;
  onPickPackage: (id: number | null) => void;
  onPickHours: (hours: number | null) => void;
}) {
  const { data, isLoading, isError } = useRentalPackages(props.cityId);
  const [mode, setMode] = useState<'package' | 'flexible'>(props.selectedHours ? 'flexible' : 'package');

  const distinctByLabel = useMemo(() => {
    const seen = new Map<string, RentalPackage>();
    for (const p of data ?? []) if (!seen.has(p.label)) seen.set(p.label, p);
    return [...seen.values()].sort((a, b) => a.includedHours - b.includedHours);
  }, [data]);

  return (
    <View style={styles.localCard}>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeBtn, mode === 'package' && styles.modeBtnActive]} onPress={() => setMode('package')}>
          <Text style={[styles.modeText, mode === 'package' && styles.modeTextActive]}>Packages</Text>
        </Pressable>
        <Pressable style={[styles.modeBtn, mode === 'flexible' && styles.modeBtnActive]} onPress={() => setMode('flexible')}>
          <Text style={[styles.modeText, mode === 'flexible' && styles.modeTextActive]}>Flexible hours</Text>
        </Pressable>
      </View>

      {mode === 'package' ? (
        isLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: spacing.lg }} />
        ) : isError || distinctByLabel.length === 0 ? (
          <Text style={styles.hint}>No packages available right now. Try flexible hours.</Text>
        ) : (
          <View style={styles.pkgGrid}>
            {distinctByLabel.map((p) => {
              const active = props.selectedPackageId != null && (data ?? []).some((x) => x.id === props.selectedPackageId && x.label === p.label);
              return (
                <Pressable key={p.label} style={[styles.pkgCard, active && styles.pkgCardActive]} onPress={() => props.onPickPackage(active ? null : p.id)}>
                  <Text style={[styles.pkgHours, active && styles.pkgTextActive]}>{p.includedHours} hrs</Text>
                  <Text style={[styles.pkgKm, active && styles.pkgTextActive]}>{p.includedKm} km</Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : (
        <HoursStepper value={props.selectedHours ?? 4} onChange={(h) => props.onPickHours(h)} />
      )}
    </View>
  );
}

function HoursStepper(props: { value: number; onChange: (h: number) => void }) {
  const dec = () => props.onChange(Math.max(1, props.value - 1));
  const inc = () => props.onChange(Math.min(24, props.value + 1));
  return (
    <View style={styles.stepperRow}>
      <Pressable style={styles.stepBtn} onPress={dec} hitSlop={8}><Text style={styles.stepGlyph}>–</Text></Pressable>
      <View style={styles.stepValueWrap}>
        <Text style={styles.stepValue}>{props.value}</Text>
        <Text style={styles.stepUnit}>hours</Text>
      </View>
      <Pressable style={styles.stepBtn} onPress={inc} hitSlop={8}><Text style={styles.stepGlyph}>+</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },

  toggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: spacing.xs, alignSelf: 'flex-start', gap: spacing.xs },
  toggleOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'transparent' },
  toggleOptionActive: { borderColor: colors.primary, backgroundColor: 'transparent' },
  toggleText: { ...type.label, color: colors.textMuted },
  toggleTextActive: { color: colors.primary },

  flightCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  flightLabel: { ...type.caption, color: colors.textMuted },
  flightInput: {
    ...type.body, color: colors.text, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },

  localCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  modeBtnActive: { backgroundColor: colors.primary },
  modeText: { ...type.label, color: colors.textMuted },
  modeTextActive: { color: colors.primaryText },
  pkgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkgCard: { flexGrow: 1, minWidth: 90, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  pkgCardActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pkgHours: { ...type.label, color: colors.text },
  pkgKm: { ...type.caption, color: colors.textMuted },
  pkgTextActive: { color: colors.primaryText },
  hint: { ...type.caption, color: colors.textMuted },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  stepGlyph: { ...type.display, fontSize: 24, color: colors.text },
  stepValueWrap: { alignItems: 'center' },
  stepValue: { ...type.display, fontSize: 28, color: colors.text },
  stepUnit: { ...type.caption, color: colors.textMuted },
});