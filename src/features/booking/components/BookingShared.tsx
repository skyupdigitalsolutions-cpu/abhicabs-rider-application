/**
 * src/features/booking/components/BookingShared.tsx
 *
 * The pieces every service tab (Ride / Rental / Airport) shares, extracted once
 * so the three screens stay thin and never duplicate the map, search, date
 * cards or the primary button. Each tab screen composes these plus its own
 * unique control.
 */

import { useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { CarDot } from '../nearby.api';
import { HomeMap } from './HomeMap';
import { colors, radius, spacing, type } from '../../../theme';

/* --------------------------------- Map ------------------------------------- */

export function SharedMap(props: {
  centre: { lat: number; lng: number } | null;
  cars: CarDot[];
  loading: boolean;
  height: number;
  pickupMode?: boolean;
  onPickupChange?: (p: { lat: number; lng: number; label: string }) => void;
  /** Centre is a city-level default, not the rider's real position. */
  approximate?: boolean;
  /** Offered when a location retry could plausibly succeed. */
  onRetryLocation?: () => void;
  /** Pixel row the pickup pin occupies — see HomeMap. */
  pinOffsetY?: number;
  /** Reports whether an address lookup is in flight. */
  onResolvingChange?: (busy: boolean) => void;
  /** The rider's real position, for the blue dot — not the same as centre. */
  userLocation?: { lat: number; lng: number } | null;
}) {
  return (
    <View style={[styles.mapLayer, { height: props.height }]}>
      <HomeMap
        centre={props.centre}
        cars={props.cars}
        loading={props.loading}
        height={props.height}
        fullBleed
        pickupMode={props.pickupMode}
        onPickupChange={props.onPickupChange}
        approximate={props.approximate}
        onRetryLocation={props.onRetryLocation}
        pinOffsetY={props.pinOffsetY}
        onResolvingChange={props.onResolvingChange}
        userLocation={props.userLocation}
      />
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

/** An intermediate stop row: tap to set/change, ✕ to remove. */
export function StopRow(props: {
  label: string;
  value: string | null;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.field}>
      <View style={[styles.dot, styles.dotStop]} />
      <Pressable style={{ flex: 1 }} onPress={props.onPress}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text style={[styles.fieldValue, !props.value && styles.fieldPlaceholder]} numberOfLines={1}>
          {props.value ?? 'Add stop'}
        </Text>
      </Pressable>
      <Pressable onPress={props.onRemove} hitSlop={10}>
        <Text style={styles.removeStop}>✕</Text>
      </Pressable>
    </View>
  );
}

/** "Add stop" affordance shown inside the route card. */
export function AddStopButton(props: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={styles.addStop}
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={6}
    >
      <Text style={[styles.addStopText, props.disabled && styles.addStopDisabled]}>
        ＋ Add stop
      </Text>
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

/* ==========================================================================
 * Ride form — the design in the reference screenshot
 * ==========================================================================
 * These are ADDITIVE. The older WhereToBar / PlaceRow / RouteCard / DateCard
 * pieces are untouched because Rental and Airport still compose them; changing
 * them in place would have silently restyled two screens nobody asked about.
 */

/** Warm near-black for the route pills. Deliberately not pure #111 — against
 *  amber, a warm dark reads as part of the same palette rather than a hole. */
const PILL_INK = '#241F1A';
const DROP_RED = '#E53935';
const TILE_BG = '#FFF6DE';
const TILE_BORDER = '#F2D488';

/**
 * One-way / Round-trip selector.
 *
 * The active pill grows a small downward caret. That is not decoration: it
 * points at the fields below and says "these belong to the choice you just
 * made", which matters because picking Round trip is what makes the Trip end
 * date appear. Without it the layout shift looks like a glitch.
 */
export function TripTypeTabs<T extends string>(props: {
  options: { key: T; label: string; icon: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.tabsRow}>
      {props.options.map((o) => {
        const active = props.value === o.key;
        return (
          <View key={o.key} style={styles.tabSlot}>
            <Pressable
              style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
              onPress={() => props.onChange(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.tabIcon}>{o.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{o.label}</Text>
            </Pressable>
            {active ? <View style={styles.tabCaret} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** The dotted spine linking the route pills. Purely visual. */
function RouteConnector() {
  return (
    <View pointerEvents="none" style={styles.connector}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.connectorDot} />
      ))}
    </View>
  );
}

/**
 * A single dark route pill: pickup, a stop, or the drop.
 *
 * `trailing` is where the drop row puts its swap control. Passing it in rather
 * than branching on kind keeps the row dumb and lets the caller decide which
 * row owns the action.
 */
export function RoutePill(props: {
  kind: 'pickup' | 'stop' | 'drop';
  value: string | null;
  placeholder: string;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const filled = Boolean(props.value);

  return (
    <View style={styles.routePill}>
      <Pressable style={styles.routePillTap} onPress={props.onPress}>
        {props.kind === 'pickup' ? (
          <Text style={styles.routeGlyph}>📍</Text>
        ) : props.kind === 'drop' ? (
          <View style={styles.dropBadge}>
            <View style={styles.dropBar} />
          </View>
        ) : (
          <View style={styles.stopBadge} />
        )}

        <Text
          style={[styles.routeText, !filled && styles.routeTextPlaceholder]}
          numberOfLines={1}
        >
          {props.value ?? props.placeholder}
        </Text>
      </Pressable>

      {props.trailing ? (
        <View style={styles.routeTrailing}>
          <View style={styles.routeTrailingRule} />
          {props.trailing}
        </View>
      ) : null}
    </View>
  );
}

/** Swap pickup and drop. Lives on the drop row, as in the reference. */
export function SwapButton(props: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Swap pickup and drop"
    >
      <Text style={[styles.swapGlyph, props.disabled && styles.swapGlyphDisabled]}>↓</Text>
    </Pressable>
  );
}

/** Remove control for a stop pill. */
export function RemoveStopButton(props: { onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} hitSlop={10} accessibilityLabel="Remove stop">
      <Text style={styles.swapGlyph}>✕</Text>
    </Pressable>
  );
}

/** Outlined "Add stop" pill. */
export function AddStopPill(props: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={[styles.addStopPill, props.disabled && styles.addStopPillDisabled]}
      onPress={props.onPress}
      disabled={props.disabled}
    >
      <Text style={[styles.addStopPillText, props.disabled && styles.addStopPillTextDisabled]}>
        ＋  Add stop
      </Text>
    </Pressable>
  );
}

/** The stacked route pills with their dotted spine. */
export function RouteStack(props: { children: React.ReactNode }) {
  return <View style={styles.routeStack}>{props.children}</View>;
}

export { RouteConnector };

/**
 * A date/time tile. Same picker behaviour as DateCard — only the skin differs,
 * so the Android two-step date-then-time flow is preserved rather than
 * reimplemented.
 */
export function DateTile(props: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
  /** Stretch to the full row when it is the only tile (one-way). */
  full?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const date = new Date(props.value);
  const open = () => {
    setMode('date');
    setShow(true);
  };

  const onPicked = (_e: unknown, picked?: Date) => {
    if (!picked) {
      setShow(false);
      return;
    }
    if (Platform.OS === 'android') {
      if (mode === 'date') {
        const merged = new Date(props.value);
        merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        props.onChange(merged.toISOString());
        setMode('time');
        setShow(true);
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
      <Pressable style={[styles.dateTile, props.full && styles.dateTileFull]} onPress={open}>
        <Text style={styles.dateTileIcon}>📅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateTileLabel}>{props.label}</Text>
          <Text style={styles.dateTileValue} numberOfLines={1}>
            {formatTripWhen(date)}
          </Text>
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

export const DateTileRow = (props: { children: React.ReactNode }) => (
  <View style={styles.dateTileRow}>{props.children}</View>
);

/** Full-width amber CTA. */
export function PrimaryCta(props: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.primaryCta, props.disabled && styles.primaryCtaDisabled]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={styles.primaryCtaText}>{props.label}</Text>
    </Pressable>
  );
}

/** "May 20, 1 PM" — matches the reference tiles. */
export function formatTripWhen(d: Date): string {
  const day = d.toLocaleString(undefined, { day: 'numeric', month: 'short' });
  const time = d
    .toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':00', '');
  return `${day}, ${time}`;
}

const styles = StyleSheet.create({
  /* ---------------- Ride form (reference design) ---------------- */

  tabsRow: { flexDirection: 'row', gap: spacing.md },
  tabSlot: { flex: 1, alignItems: 'center' },
  tab: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: 14, borderRadius: radius.pill, borderWidth: 1.5,
  },
  tabIdle: { backgroundColor: colors.surface, borderColor: TILE_BORDER },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabIcon: { fontSize: 16 },
  tabLabel: { ...type.body, fontWeight: '700', color: colors.text },
  tabLabelActive: { color: colors.primaryText },
  // Triangle via borders — RN has no clip-path.
  tabCaret: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: colors.primary,
  },

  routeStack: { marginTop: spacing.lg },
  routePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: PILL_INK, borderRadius: radius.pill,
    paddingLeft: spacing.lg, paddingRight: spacing.md, minHeight: 54,
  },
  routePillTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  routeGlyph: { fontSize: 15, width: 20, textAlign: 'center' },
  dropBadge: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: DROP_RED,
    alignItems: 'center', justifyContent: 'center',
  },
  dropBar: { width: 10, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  stopBadge: {
    width: 14, height: 14, borderRadius: 7, marginHorizontal: 3,
    borderWidth: 3, borderColor: colors.primary, backgroundColor: 'transparent',
  },
  routeText: { ...type.body, color: '#FFFFFF', flex: 1 },
  routeTextPlaceholder: { color: 'rgba(255,255,255,0.55)' },
  routeTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.sm },
  routeTrailingRule: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.28)' },
  swapGlyph: { fontSize: 18, color: '#FFFFFF', paddingHorizontal: spacing.xs },
  swapGlyphDisabled: { color: 'rgba(255,255,255,0.3)' },

  // Sits between two pills, aligned under the icon column.
  connector: { height: 16, paddingLeft: spacing.lg + 9, justifyContent: 'space-evenly' },
  connectorDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.textMuted },

  addStopPill: {
    marginTop: spacing.lg, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: TILE_BORDER, backgroundColor: colors.surface,
  },
  addStopPillDisabled: { borderColor: colors.border },
  addStopPillText: { ...type.body, fontWeight: '600', color: colors.text },
  addStopPillTextDisabled: { color: colors.textMuted },

  dateTileRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  dateTile: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: TILE_BG, borderWidth: 1.5, borderColor: TILE_BORDER,
    borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  },
  dateTileFull: { flex: 1 },
  dateTileIcon: { fontSize: 18 },
  dateTileLabel: { ...type.caption, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  dateTileValue: { ...type.label, fontSize: 15, color: colors.text, fontWeight: '700' },

  primaryCta: {
    marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 17, borderRadius: radius.pill, backgroundColor: colors.primary,
  },
  primaryCtaDisabled: { backgroundColor: colors.border },
  primaryCtaText: { ...type.title, fontSize: 18, color: colors.primaryText },

  mapLayer: { borderRadius: 0 },

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
  dotStop: { backgroundColor: colors.textMuted },
  removeStop: { ...type.label, color: colors.textMuted, fontSize: 16, paddingHorizontal: spacing.sm },
  addStop: { paddingVertical: spacing.sm, marginLeft: 22 },
  addStopText: { ...type.label, color: colors.primary },
  addStopDisabled: { color: colors.textMuted },
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