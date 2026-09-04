/**
 * src/features/booking/screens/HomeScreen.tsx — full-screen-map layout.
 *
 * The live map fills the top of the screen edge-to-edge; a rounded card floats
 * up over its lower edge with the booking controls: service tabs (Outstation /
 * Local / Airport), a "Where to?" entry, Trip Start / Trip End date-time
 * pickers, and the primary action. All booking logic is unchanged; only the
 * presentation is new. The map is lazy so react-native-maps stays off boot.
 */

import { lazy, Suspense, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useSavedAddresses, useRentalPackages } from '../api';
import { useNearbyCars } from '../nearby.api';
import { useUserLocation } from '../../../lib/useUserLocation';
import type { HomeScreenProps } from '../../../navigation/types';
import type { TripType, ServiceKind, RentalPackage } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

const HomeMap = lazy(() =>
  import('../components/HomeMap').then((m) => ({ default: m.HomeMap })),
);

const { height: SCREEN_H } = Dimensions.get('window');
const MAP_HEIGHT = Math.round(SCREEN_H * 0.55);

export function HomeScreen({ navigation }: HomeScreenProps) {
  const draft = useBookingDraft();
  const {
    cityId, pickup, drop, tripType, rentalPackageId, rentalHours,
    pickupAt, returnAt,
    setTripType, setRentalPackageId, setRentalHours,
    setPickupAt, setReturnAt,
  } = draft;

  useSavedAddresses();
  const { coord: userLoc, status: locStatus } = useUserLocation();
  const nearby = useNearbyCars(userLoc);

  const service: ServiceKind =
    tripType === 'HOURLY' ? 'LOCAL' : tripType === 'AIRPORT' ? 'AIRPORT' : 'OUTSTATION';

  function selectService(next: ServiceKind) {
    if (next === 'OUTSTATION') setTripType('ONE_WAY');
    else if (next === 'LOCAL') setTripType('HOURLY');
    else setTripType('AIRPORT');
  }

  const hourlyReady = tripType !== 'HOURLY' || Boolean(rentalPackageId || rentalHours);
  const canContinue =
    service === 'LOCAL' ? Boolean(pickup) && hourlyReady : Boolean(pickup && drop);

  const showReturn = tripType === 'ROUND_TRIP';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={styles.mapLayer}>
        <Suspense fallback={<View style={styles.mapFallback}><ActivityIndicator color={colors.primary} /></View>}>
          <HomeMap
            centre={userLoc}
            cars={nearby.data ?? []}
            loading={locStatus === 'loading'}
            height={MAP_HEIGHT}
            fullBleed
          />
        </Suspense>
      </View>

      <View style={styles.topOverlay}>
        <Pressable style={styles.topPill} onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={styles.topPillText}>☰  Account</Text>
        </Pressable>
        <Pressable style={styles.topPill} onPress={() => navigation.navigate('Trips')} hitSlop={8}>
          <Text style={styles.topPillText}>Your trips</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandStrip}>
          <Text style={styles.brandText}>AbhiCabs</Text>
        </View>

        <ServiceTabs value={service} onChange={selectService} />

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

        <Pressable
          style={styles.whereTo}
          onPress={() => navigation.navigate('PlaceSearch', { field: pickup ? 'drop' : 'pickup' })}
        >
          <Text style={styles.whereToIcon}>🔍</Text>
          <Text style={[styles.whereToText, !pickup && !drop && styles.whereToPlaceholder]}>
            {drop?.label ?? pickup?.label ?? 'Where to?'}
          </Text>
        </Pressable>

        <View style={styles.routeCard}>
          <PlaceRow
            kind="pickup"
            label={service === 'LOCAL' ? 'From' : 'Pickup'}
            value={pickup?.label ?? null}
            placeholder="Add pickup point"
            onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
          />
          {service !== 'LOCAL' ? (
            <>
              <View style={styles.divider} />
              <PlaceRow
                kind="drop"
                label="Drop"
                value={drop?.label ?? null}
                placeholder="Where to?"
                onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })}
              />
            </>
          ) : null}
        </View>

        <View style={styles.dateRow}>
          <DateCard label="Trip Start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} />
          {showReturn ? (
            <DateCard label="Trip End" value={returnAt ?? pickupAt} onChange={(iso) => setReturnAt(iso)} minimumDate={new Date(pickupAt)} />
          ) : (
            <View style={styles.dateCardSpacer} />
          )}
        </View>

        {service === 'LOCAL' ? (
          <LocalRentalPicker
            cityId={cityId}
            selectedPackageId={rentalPackageId}
            selectedHours={rentalHours}
            onPickPackage={setRentalPackageId}
            onPickHours={setRentalHours}
          />
        ) : null}

        <Pressable
          style={[styles.cta, !canContinue && styles.ctaDisabled]}
          disabled={!canContinue}
          onPress={() => navigation.navigate('FareOptions')}
        >
          <Text style={styles.ctaText}>Search Car</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* -------------------------------- Subviews --------------------------------- */

function ServiceTabs(props: { value: ServiceKind; onChange: (s: ServiceKind) => void }) {
  const tabs: { key: ServiceKind; label: string; icon: string }[] = [
    { key: 'OUTSTATION', label: 'Ride', icon: '🚗' },
    { key: 'LOCAL', label: 'Rental', icon: '⏱️' },
    { key: 'AIRPORT', label: 'Airport', icon: '✈️' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const active = props.value === t.key;
        return (
          <Pressable
            key={t.key}
            style={[styles.tab, active && styles.tabActiveShadow]}
            onPress={() => props.onChange(t.key)}
          >
            <LinearGradient
              colors={active ? ['#FFD54F', '#FFB300'] : ['#FFFFFF', '#F2F2F2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.tabGradient}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.icon}  {t.label}
              </Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </View>
  );
}

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

function DateCard(props: { label: string; value: string; onChange: (iso: string) => void; minimumDate?: Date }) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const date = new Date(props.value);

  const open = () => { setMode('date'); setShow(true); };

  const onPicked = (_event: unknown, picked?: Date) => {
    if (!picked) { setShow(false); return; }
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

function PlaceRow(props: { kind: 'pickup' | 'drop'; label: string; value: string | null; placeholder: string; onPress: () => void }) {
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

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: MAP_HEIGHT },
  mapFallback: { flex: 1, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
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
  sheet: { flex: 1, marginTop: MAP_HEIGHT - 28 },
  sheetContent: {
    backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg,
    minHeight: SCREEN_H - MAP_HEIGHT + 40,
  },
  brandStrip: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginBottom: spacing.xs },
  brandText: { ...type.display, fontSize: 22, color: colors.primaryText, fontWeight: '800' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    borderRadius: radius.pill,
  },
  tabActiveShadow: {
    backgroundColor: colors.primary, // solid layer for the shadow to cast from
    shadowColor: '#111111',
    shadowOpacity: 0.20,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tabGradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.pill,
    overflow: 'hidden', // clips the gradient to the pill shape
  },
  tabText: { ...type.label, color: colors.textMuted, fontSize: 13 },
  tabTextActive: { color: colors.primaryText },

  toggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: spacing.xs, alignSelf: 'flex-start' },
  toggleOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleText: { ...type.label, color: colors.textMuted },
  toggleTextActive: { color: colors.primaryText },
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
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  ctaDisabled: { backgroundColor: colors.surfaceAlt },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },
});