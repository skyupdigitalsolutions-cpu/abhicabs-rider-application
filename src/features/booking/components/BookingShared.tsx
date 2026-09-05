/**
 * src/features/booking/components/BookingShared.tsx
 *
 * The pieces every service tab (Ride / Rental / Airport) shares, extracted once
 * so the three screens stay thin and never duplicate the map, search, date
 * cards or the primary button. Each tab screen composes these plus its own
 * unique control.
 */

import { lazy, Suspense, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { CarDot } from '../nearby.api';
import { colors, radius, spacing, type } from '../../../theme';

const HomeMap = lazy(() =>
  import('./HomeMap').then((m) => ({ default: m.HomeMap })),
);

/* --------------------------------- Map ------------------------------------- */

export function SharedMap(props: {
  centre: { lat: number; lng: number } | null;
  cars: CarDot[];
  loading: boolean;
  height: number;
  pickupMode?: boolean;
  onPickupChange?: (p: { lat: number; lng: number; label: string }) => void;
}) {
  return (
    <View style={[styles.mapLayer, { height: props.height }]}>
      <Suspense fallback={<View style={styles.mapFallback}><ActivityIndicator color={colors.primary} /></View>}>
        <HomeMap
          centre={props.centre}
          cars={props.cars}
          loading={props.loading}
          height={props.height}
          fullBleed
          pickupMode={props.pickupMode}
          onPickupChange={props.onPickupChange}
        />
      </Suspense>
    </View>
  );
}

/* ------------------------------ "Where to?" -------------------------------- */

export function WhereToBar(props: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.whereTo} onPress={props.onPress}>
      <Text style={styles.whereToIcon}>🔍</Text>
      <Text style={[styles.whereToText, props.label === 'Where to?' && styles.whereToPlaceholder]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------ Pickup/Drop -------------------------------- */

export function PlaceRow(props: {
  kind: 'pickup' | 'drop';
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.field} onPress={props.onPress}>
      <View style={[styles.dot, props.kind === 'pickup' ? styles.dotPickup : styles.dotDrop]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text style={[styles.fieldValue, !props.value && styles.fieldPlaceholder]} numberOfLines={1}>
          {props.value ?? props.placeholder}
        </Text>
      </View>
    </Pressable>
  );
}

export function RouteCard(props: { children: React.ReactNode }) {
  return <View style={styles.routeCard}>{props.children}</View>;
}

export const Divider = () => <View style={styles.divider} />;

/* ------------------------------- Date cards -------------------------------- */

export function DateCard(props: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const date = new Date(props.value);
  const open = () => { setMode('date'); setShow(true); };

  const onPicked = (_e: unknown, picked?: Date) => {
    if (!picked) { setShow(false); return; }
    if (Platform.OS === 'android') {
      if (mode === 'date') {
        const merged = new Date(props.value);
        merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        props.onChange(merged.toISOString());
        setMode('time'); setShow(true);
        return;
      }
      const merged = new Date(props.value);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      props.onChange(merged.toISOString());
      setShow(false);
      return;
    }
    props.onChange(picked.toISOString());
  };

  return (
    <>
      <Pressable style={styles.dateCard} onPress={open}>
        <Text style={styles.dateIcon}>📅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateLabel}>{props.label}</Text>
          <Text style={styles.dateValue}>{formatWhen(date)}</Text>
        </View>
      </Pressable>
      {show ? (
        <DateTimePicker
          value={date}
          mode={Platform.OS === 'ios' ? 'datetime' : mode}
          minimumDate={props.minimumDate}
          onChange={onPicked}
        />
      ) : null}
    </>
  );
}

export const DateSpacer = () => <View style={styles.dateCardSpacer} />;
export const DateRow = (props: { children: React.ReactNode }) => <View style={styles.dateRow}>{props.children}</View>;

/* ------------------------------- CTA button -------------------------------- */

export function SearchButton(props: { disabled: boolean; onPress: () => void; label?: string }) {
  return (
    <Pressable
      style={[styles.cta, props.disabled && styles.ctaDisabled]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={styles.ctaText}>{props.label ?? 'Search Car'}</Text>
    </Pressable>
  );
}

/* -------------------------------- Helpers ---------------------------------- */

export function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  mapLayer: { borderRadius: 0 },
  mapFallback: { flex: 1, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  whereTo: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
  },
  whereToIcon: { fontSize: 18 },
  whereToText: { ...type.label, color: colors.text, fontSize: 16, flex: 1 },
  whereToPlaceholder: { color: colors.textMuted },

  routeCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  field: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  dotPickup: { backgroundColor: colors.primary },
  dotDrop: { backgroundColor: colors.danger },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text },
  fieldPlaceholder: { color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 22, marginVertical: spacing.xs },

  dateRow: { flexDirection: 'row', gap: spacing.md },
  dateCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  dateCardSpacer: { flex: 1 },
  dateIcon: { fontSize: 18 },
  dateLabel: { ...type.caption, color: colors.textMuted },
  dateValue: { ...type.label, color: colors.primary, fontSize: 13 },

  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  ctaDisabled: { backgroundColor: colors.surfaceAlt },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },
});