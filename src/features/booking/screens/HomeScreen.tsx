/**
 * src/features/booking/screens/HomeScreen.tsx
 *
 * The launch pad for a ride. It shows the two things that start every booking —
 * "from where" and "to where" — plus saved addresses as one-tap shortcuts and a
 * trip-type toggle. Tapping a field opens the search screen; the chosen place
 * lands back in the booking draft, which this screen reads reactively.
 *
 * No map yet (that arrives with the fare/route slice). The pickup/drop fields
 * are the interaction; the map is decoration we add once selection works.
 *
 * Empty state, per the design guidance, is an invitation: when nothing is
 * chosen the field reads "Add pickup" / "Where to?" — a prompt to act, not a
 * blank.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSession } from '../../../store/session';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useSavedAddresses, useRentalPackages } from '../api';
import type { HomeScreenProps } from '../../../navigation/types';
import type { SavedAddress, TripType, ServiceKind, RentalPackage } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const userName = useSession((s) => s.user?.name ?? 'there');
  const draft = useBookingDraft();
  const {
    cityId, pickup, drop, tripType, rentalPackageId, rentalHours,
    setTripType, setPickup, swap, setRentalPackageId, setRentalHours,
  } = draft;
  const addresses = useSavedAddresses();

  // Which top tab is active is derived from the wire tripType.
  const service: ServiceKind =
    tripType === 'HOURLY' ? 'LOCAL' : tripType === 'AIRPORT' ? 'AIRPORT' : 'OUTSTATION';

  // Switching tabs picks a sensible default TripType for that service.
  function selectService(next: ServiceKind) {
    if (next === 'OUTSTATION') setTripType('ONE_WAY');
    else if (next === 'LOCAL') setTripType('HOURLY');
    else setTripType('AIRPORT');
  }

  // HOURLY requires a package or hours before we can quote.
  const hourlyReady = tripType !== 'HOURLY' || Boolean(rentalPackageId || rentalHours);
  // Local (hourly) has no drop — pickup + a package/hours is enough. Every other
  // service needs both pickup and drop.
  const canContinue =
    service === 'LOCAL'
      ? Boolean(pickup) && hourlyReady
      : Boolean(pickup && drop);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hi {userName.split(' ')[0]}</Text>
      <Text style={styles.prompt}>Where are you headed?</Text>

      {/* Savaari-style top tabs */}
      <ServiceTabs value={service} onChange={selectService} />

      {/* Outstation has a one-way / round-trip sub-toggle */}
      {service === 'OUTSTATION' ? (
        <SubToggle
          options={[
            { key: 'ONE_WAY', label: 'One way' },
            { key: 'ROUND_TRIP', label: 'Round trip' },
          ]}
          value={tripType}
          onChange={setTripType}
        />
      ) : null}

      {/* Pickup / drop card. Local rentals have no destination, so only pickup. */}
      <View style={styles.routeCard}>
        <PlaceField
          kind="pickup"
          label={service === 'LOCAL' ? 'From' : 'Pickup'}
          value={pickup?.label ?? null}
          placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
        />

        {service !== 'LOCAL' ? (
          <>
            <View style={styles.divider} />
            <PlaceField
              kind="drop"
              label="Drop"
              value={drop?.label ?? null}
              placeholder="Where to?"
              onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })}
            />

            {pickup && drop ? (
              <Pressable style={styles.swapButton} onPress={swap} hitSlop={8}>
                <Text style={styles.swapText}>Swap</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>

      {/* LOCAL: package picker + flexible hours */}
      {service === 'LOCAL' ? (
        <LocalRentalPicker
          cityId={cityId}
          selectedPackageId={rentalPackageId}
          selectedHours={rentalHours}
          onPickPackage={setRentalPackageId}
          onPickHours={setRentalHours}
        />
      ) : null}

      {/* Saved addresses as quick pickup shortcuts */}
      <SavedAddresses
        query={addresses}
        onPick={(a) =>
          setPickup({
            label: `${a.label} · ${a.line1}`,
            lat: a.lat ? Number(a.lat) : NaN,
            lng: a.lng ? Number(a.lng) : NaN,
            placeId: null,
          })
        }
      />

      <Pressable
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={() => navigation.navigate('FareOptions')}
      >
        <Text style={styles.ctaText}>See fares</Text>
      </Pressable>
    </ScrollView>
  );
}

/* -------------------------------- Subviews --------------------------------- */

/** The three top-level services, Savaari-style. */
function ServiceTabs(props: { value: ServiceKind; onChange: (s: ServiceKind) => void }) {
  const tabs: { key: ServiceKind; label: string }[] = [
    { key: 'OUTSTATION', label: 'Outstation' },
    { key: 'LOCAL', label: 'Local' },
    { key: 'AIRPORT', label: 'Airport' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const active = props.value === t.key;
        return (
          <Pressable
            key={t.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => props.onChange(t.key)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small pill sub-toggle (e.g. one-way / round-trip under Outstation). */
function SubToggle(props: {
  options: { key: TripType; label: string }[];
  value: TripType;
  onChange: (t: TripType) => void;
}) {
  return (
    <View style={styles.toggle}>
      {props.options.map((o) => {
        const active = props.value === o.key;
        return (
          <Pressable
            key={o.key}
            style={[styles.toggleOption, active && styles.toggleOptionActive]}
            onPress={() => props.onChange(o.key)}
          >
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Local-rental chooser: the fixed packages (4/40, 8/80, 12/120) as selectable
 * cards, plus a "flexible hours" stepper for anyone who wants a custom duration.
 * Fixed package and flexible hours are mutually exclusive (the store enforces
 * it); picking one visually clears the other.
 */
function LocalRentalPicker(props: {
  cityId: number;
  selectedPackageId: number | null;
  selectedHours: number | null;
  onPickPackage: (id: number | null) => void;
  onPickHours: (hours: number | null) => void;
}) {
  const { data, isLoading, isError } = useRentalPackages(props.cityId);
  const [mode, setMode] = useState<'package' | 'flexible'>(
    props.selectedHours ? 'flexible' : 'package',
  );

  // Packages come back per vehicle class; the labels (4hr/40km…) repeat across
  // classes, so present one card per distinct label for the user to pick the
  // DURATION. The actual class is chosen on the fares screen.
  const distinctByLabel = useMemo(() => {
    const seen = new Map<string, RentalPackage>();
    for (const p of data ?? []) if (!seen.has(p.label)) seen.set(p.label, p);
    return [...seen.values()].sort((a, b) => a.includedHours - b.includedHours);
  }, [data]);

  return (
    <View style={styles.localCard}>
      {/* mode switch */}
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeBtn, mode === 'package' && styles.modeBtnActive]}
          onPress={() => setMode('package')}
        >
          <Text style={[styles.modeText, mode === 'package' && styles.modeTextActive]}>Packages</Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, mode === 'flexible' && styles.modeBtnActive]}
          onPress={() => setMode('flexible')}
        >
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
              const active = props.selectedPackageId != null &&
                (data ?? []).some((x) => x.id === props.selectedPackageId && x.label === p.label);
              return (
                <Pressable
                  key={p.label}
                  style={[styles.pkgCard, active && styles.pkgCardActive]}
                  // Store the id of THIS label's row; the fares screen re-resolves
                  // per class. We pass the representative id here.
                  onPress={() => props.onPickPackage(active ? null : p.id)}
                >
                  <Text style={[styles.pkgHours, active && styles.pkgTextActive]}>
                    {p.includedHours} hrs
                  </Text>
                  <Text style={[styles.pkgKm, active && styles.pkgTextActive]}>
                    {p.includedKm} km
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : (
        <HoursStepper
          value={props.selectedHours ?? 4}
          onChange={(h) => props.onPickHours(h)}
        />
      )}
    </View>
  );
}

function HoursStepper(props: { value: number; onChange: (h: number) => void }) {
  const dec = () => props.onChange(Math.max(1, props.value - 1));
  const inc = () => props.onChange(Math.min(24, props.value + 1));
  return (
    <View style={styles.stepperRow}>
      <Pressable style={styles.stepBtn} onPress={dec} hitSlop={8}>
        <Text style={styles.stepGlyph}>–</Text>
      </Pressable>
      <View style={styles.stepValueWrap}>
        <Text style={styles.stepValue}>{props.value}</Text>
        <Text style={styles.stepUnit}>hours</Text>
      </View>
      <Pressable style={styles.stepBtn} onPress={inc} hitSlop={8}>
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

function PlaceField(props: {
  kind: 'pickup' | 'drop';
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.field} onPress={props.onPress}>
      <View style={[styles.dot, props.kind === 'pickup' ? styles.dotPickup : styles.dotDrop]} />
      <View style={styles.fieldTextWrap}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text
          style={[styles.fieldValue, !props.value && styles.fieldPlaceholder]}
          numberOfLines={1}
        >
          {props.value ?? props.placeholder}
        </Text>
      </View>
    </Pressable>
  );
}

function SavedAddresses(props: {
  query: ReturnType<typeof useSavedAddresses>;
  onPick: (a: SavedAddress) => void;
}) {
  const { data, isLoading, isError } = props.query;

  // Only addresses that have coordinates can seed a booking directly.
  const usable = useMemo(() => (data ?? []).filter((a) => a.lat && a.lng), [data]);

  if (isLoading) {
    return (
      <View style={styles.savedLoading}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (isError || usable.length === 0) return null; // silent: shortcuts are a bonus, not required

  return (
    <View style={styles.saved}>
      <Text style={styles.savedTitle}>Saved places</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRow}>
        {usable.map((a) => (
          <Pressable key={a.id} style={styles.savedChip} onPress={() => props.onPick(a)}>
            <Text style={styles.savedChipLabel}>{a.label}</Text>
            <Text style={styles.savedChipLine} numberOfLines={1}>
              {a.line1}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  greeting: { ...type.body, color: colors.textMuted },
  prompt: { ...type.display, color: colors.text, marginBottom: spacing.sm },

  /* top service tabs */
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.primaryText },

  sectionLabel: { ...type.label, color: colors.text, marginBottom: spacing.xs },

  /* local rental */
  localCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeBtn: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
  },
  modeBtnActive: { backgroundColor: colors.primary },
  modeText: { ...type.label, color: colors.textMuted },
  modeTextActive: { color: colors.primaryText },

  pkgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkgCard: {
    flexGrow: 1, minWidth: 90, alignItems: 'center',
    paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  pkgCardActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pkgHours: { ...type.label, color: colors.text },
  pkgKm: { ...type.caption, color: colors.textMuted },
  pkgTextActive: { color: colors.primaryText },

  /* flexible hours stepper */
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: {
    width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  stepGlyph: { ...type.display, fontSize: 24, color: colors.text },
  stepValueWrap: { alignItems: 'center' },
  stepValue: { ...type.display, fontSize: 28, color: colors.text },
  stepUnit: { ...type.caption, color: colors.textMuted },

  /* airport */
  airportCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs,
  },
  flightInput: {
    ...type.body, color: colors.text, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  hint: { ...type.caption, color: colors.textMuted },

  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xs,
    alignSelf: 'flex-start',
  },
  toggleOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleText: { ...type.label, color: colors.textMuted },
  toggleTextActive: { color: colors.primaryText },

  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  field: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  dotPickup: { backgroundColor: colors.primary },
  dotDrop: { backgroundColor: colors.danger },
  fieldTextWrap: { flex: 1 },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text },
  fieldPlaceholder: { color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 22 },
  swapButton: { position: 'absolute', right: spacing.lg, top: spacing.lg },
  swapText: { ...type.label, color: colors.primary },

  saved: { gap: spacing.sm },
  savedLoading: { paddingVertical: spacing.md, alignItems: 'flex-start' },
  savedTitle: { ...type.label, color: colors.textMuted },
  savedRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  savedChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minWidth: 140,
  },
  savedChipLabel: { ...type.label, color: colors.text },
  savedChipLine: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaDisabled: { backgroundColor: colors.surfaceAlt },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },
});