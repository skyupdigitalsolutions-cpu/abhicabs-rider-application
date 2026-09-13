/**
 * src/features/booking/screens/FareOptionsScreen.tsx
 *
 * Stage two of the booking flow, in two steps over a live route map:
 *
 *   1. RIDE     — quote every vehicle class (one backend call), pick one
 *   2. PAYMENT  — pick full / advance / pay-later, then create the booking
 *
 * ---------------------------------------------------------------------------
 * WHY TWO STEPS AND NOT ONE LONG PAGE
 * ---------------------------------------------------------------------------
 * These are different kinds of decision. Choosing a class is a comparison —
 * prices side by side, ETAs, seats. Choosing how to pay is a commitment, and it
 * only makes sense once there is an amount attached to it. Stacking them meant
 * the rider scrolled past payment options that were meaningless until they had
 * picked a car, and the page ended with two unrelated choices competing for the
 * same Continue button.
 *
 * Splitting them also lets the payment step state the actual amount, which the
 * combined page could not do until a class was chosen anyway.
 *
 * ---------------------------------------------------------------------------
 * THE MAP
 * ---------------------------------------------------------------------------
 * TripMap is reused rather than reimplemented. It already fetches the
 * road-following route from /fares/route and draws pickup and drop markers —
 * exactly what is wanted here — and reusing it means the route the rider sees
 * while choosing is drawn by the same code that will draw it during the trip.
 *
 * The map fills the screen BEHIND the sheet and stays fully interactive — pan,
 * pinch, the 3D toggle. An earlier version wrapped it in pointerEvents="none"
 * to keep taps flowing to the sheet, which also swallowed every map gesture.
 * The sheet is a sibling laid over it, so both get their own touches without
 * either having to block the other.
 *
 * Local rentals have no drop, so there is no route to draw; the map is skipped
 * entirely rather than shown with one lonely marker.
 *
 * "No waiting" still holds: the fare query is cached by route signature, so
 * arriving from Home paints instantly if the same route was quoted moments ago;
 * a genuine first load shows skeleton rows, never a blank screen; and Continue
 * shows an inline spinner on the button rather than blocking the page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useFareOptions, useCreateBooking } from '../api';
import { vehicleClassInfo } from '../../../config/catalog';
import { TripMap } from '../../trip/components/TripMap';
import { DraggableSheet, type SnapName } from '../components/DraggableSheet';
import { AbhiApiError } from '../../../types/api';
import type { FareOptionsScreenProps } from '../../../navigation/types';
import type { FareOption, PaymentMode } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * The map is full-screen behind the sheet, exactly as on Home. Sizing it to the
 * visible strip instead would leave it unable to pan into the area the sheet
 * later uncovers.
 */
const MAP_H = SCREEN_H;

/**
 * Space reserved at the bottom of the sheet's content: the pinned footer, plus
 * the 40pt the sheet body deliberately hangs past the screen edge (its wrapper
 * is containerHeight - FULL + 40), plus breathing room so the last row is not
 * flush against the button.
 */
const FOOTER_CLEARANCE = 110 + 40 + 24;

/** How far the sheet rides up over the map's lower edge. */
const SHEET_OVERLAP = 24;

type Step = 'RIDE' | 'PAYMENT';

const PAYMENT_MODES: { key: PaymentMode; label: string; hint: string; glyph: string }[] = [
  { key: 'FULL', label: 'Pay full', hint: 'Pay the whole fare now', glyph: '💳' },
  { key: 'PARTIAL', label: 'Pay advance', hint: 'Pay a part now, rest later', glyph: '🪙' },
  { key: 'ZERO', label: 'Pay later', hint: 'Nothing now, pay after the ride', glyph: '🤝' },
];

export function FareOptionsScreen({ navigation }: FareOptionsScreenProps) {
  const draft = useBookingDraft();
  const [step, setStep] = useState<Step>('RIDE');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('FULL');
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Tracked the way Home tracks it; kept so the sheet's contract matches.
  const [, setSnap] = useState<SnapName>('half');

  const fares = useFareOptions({
    cityId: draft.cityId,
    tripType: draft.tripType,
    pickup: draft.pickup,
    drop: draft.drop,
    stops: draft.stops,
    pickupAt: draft.pickupAt,
    returnAt: draft.returnAt,
    rentalPackageId: draft.rentalPackageId,
    rentalHours: draft.rentalHours,
  });

  const create = useCreateBooking();

  // Auto-select the cheapest class once options arrive, so a price is always
  // highlighted and Continue is immediately actionable.
  const options = fares.data ?? [];
  const cheapest = useMemo(() => {
    if (options.length === 0) return null;
    return [...options].sort((a, b) => Number(a.total) - Number(b.total))[0]!.vehicleClass;
  }, [options]);
  const activeClass = selectedClass ?? cheapest;

  const activeOption = options.find((o) => o.vehicleClass === activeClass) ?? null;
  const isHourly = draft.tripType === 'HOURLY';

  /** A route needs both ends. Local rentals have no drop, so no map. */
  const hasRoute = Boolean(draft.pickup && draft.drop);

  /* ---- step transition ------------------------------------------------ */

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade-and-rise on every step change, so the panel reads as replaced
    // rather than redrawn.
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, slide]);

  const panelStyle = {
    opacity: slide,
    transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };

  const onContinue = async () => {
    // Local rentals have no drop; every other type needs one.
    if (!activeClass || !draft.pickup || (!isHourly && !draft.drop)) return;
    setSubmitError(null);

    // Compute a FRESH pickup time at submit, safely above the backend's 15-min
    // minimum-lead rule. The draft's default can go stale while the user browses
    // fares, so recompute here (20 min out) rather than reuse a timestamp that
    // may now be too soon.
    const pickupAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    // A ROUND_TRIP must carry a returnAt (the backend rejects it otherwise).
    // Until a return-time picker exists, default the return to 4 hours after
    // pickup so a round trip is always valid.
    const returnAt =
      draft.tripType === 'ROUND_TRIP'
        ? draft.returnAt ??
          new Date(new Date(pickupAt).getTime() + 4 * 60 * 60 * 1000).toISOString()
        : undefined;

    try {
      const booking = await create.mutateAsync({
        cityId: draft.cityId,
        vehicleClass: activeClass,
        tripType: draft.tripType,
        pickup: { lat: draft.pickup.lat, lng: draft.pickup.lng, address: draft.pickup.label },
        ...(draft.drop
          ? { drop: { lat: draft.drop.lat, lng: draft.drop.lng, address: draft.drop.label } }
          : {}),
        ...(draft.stops.length
          ? { stops: draft.stops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.label })) }
          : {}),
        pickupAt,
        ...(returnAt ? { returnAt } : {}),
        ...(draft.rentalPackageId ? { rentalPackageId: draft.rentalPackageId } : {}),
        ...(draft.rentalHours ? { rentalHours: draft.rentalHours } : {}),
        scheduled: true,
        paymentMode,
      });
      draft.reset();
      // Replace so Back doesn't return to a stale fare screen for a booking that
      // now exists.
      navigation.replace('Trip', { bookingId: booking.id });
    } catch (e) {
      setSubmitError(
        e instanceof AbhiApiError ? e.message : 'Could not create the booking. Please try again.',
      );
    }
  };

  return (
    <View style={styles.root}>
      {/* ---- route map -------------------------------------------------
          No pointerEvents override: the map owns its own touches, so pan,
          pinch and the 3D toggle all work. The sheet sits over it as a
          sibling and takes the touches that land on it. */}
      {hasRoute ? (
        <View style={styles.mapLayer}>
          <TripMap
            pickup={{ lat: draft.pickup!.lat, lng: draft.pickup!.lng }}
            drop={{ lat: draft.drop!.lat, lng: draft.drop!.lng }}
            // Flat, not tilted: this is a route being read, not a trip being
            // followed, and 3D buildings make a static line harder to trace.
            // The rider can still tilt it with the on-map toggle.
            threeD={false}
            height={MAP_H}
            fullBleed
          />
        </View>
      ) : null}

      {/* Floating back button. The screen has no navigation header — see the
          note on the route in App.tsx — so this is the only way out, and it
          carries its own dark scrim to stay legible over the map. */}
      <Pressable
        style={styles.backFab}
        onPress={() => navigation.goBack()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backFabGlyph}>‹</Text>
      </Pressable>

      {/* ---- draggable sheet -------------------------------------------
          The same component the home screen uses, with the same snap points,
          so the sheet behaves identically wherever the rider meets it. */}
      <DraggableSheet onSnap={setSnap} contentContainerStyle={styles.sheetContent}>
        {/* ---- step indicator ---------------------------------------- */}
        <View style={styles.steps}>
          <StepDot index={1} label="Ride" active={step === 'RIDE'} done={step === 'PAYMENT'} />
          <View style={[styles.stepLine, step === 'PAYMENT' && styles.stepLineDone]} />
          <StepDot index={2} label="Payment" active={step === 'PAYMENT'} done={false} />
        </View>

        <Text style={styles.heading}>
          {step === 'RIDE' ? 'Choose your ride' : 'How would you like to pay?'}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {isHourly
            ? draft.pickup?.label ?? 'Pickup'
            : `${draft.pickup?.label ?? 'Pickup'} → ${draft.drop?.label ?? 'Drop'}`}
        </Text>

        <Animated.View style={panelStyle}>
          {step === 'RIDE' ? (
            <RideStep
              fares={fares}
              options={options}
              activeClass={activeClass}
              onSelect={setSelectedClass}
            />
          ) : (
            <PaymentStep
              option={activeOption}
              value={paymentMode}
              onChange={setPaymentMode}
              onChangeVehicle={() => setStep('RIDE')}
            />
          )}
        </Animated.View>

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
      </DraggableSheet>

      {/* ---- sticky footer --------------------------------------------- */}
      {options.length > 0 ? (
        <View style={styles.footer}>
          {/* Back out of payment without losing the chosen class. Only on the
              second step — on the first, the header's back arrow is the way
              out and a second one would just be noise. */}
          {step === 'PAYMENT' ? (
            <Pressable style={styles.backBtn} onPress={() => setStep('RIDE')}>
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.cta, (!activeClass || create.isPending) && styles.ctaDisabled]}
            disabled={!activeClass || create.isPending}
            onPress={step === 'RIDE' ? () => setStep('PAYMENT') : onContinue}
          >
            {create.isPending ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.ctaText}>
                {step === 'RIDE'
                  ? `Continue${activeOption ? ` · ₹${activeOption.total}` : ''}`
                  : `Book ${activeClass ? vehicleClassInfo(activeClass).label : ''}`}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------- Steps ------------------------------------ */

function RideStep({
  fares,
  options,
  activeClass,
  onSelect,
}: {
  fares: ReturnType<typeof useFareOptions>;
  options: FareOption[];
  activeClass: string | null;
  onSelect: (k: string) => void;
}) {
  if (fares.isLoading) {
    return (
      <View style={styles.list}>
        {[0, 1, 2].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </View>
    );
  }

  if (fares.isError) {
    return (
      <ErrorCard
        message={
          fares.error instanceof AbhiApiError
            ? fares.error.message
            : 'Could not load fares for this route.'
        }
        onRetry={() => fares.refetch()}
      />
    );
  }

  if (options.length === 0) {
    return (
      <ErrorCard
        message="No rides available for this route right now."
        onRetry={() => fares.refetch()}
      />
    );
  }

  return (
    <View style={styles.list}>
      {options.map((opt) => (
        <FareRow
          key={opt.vehicleClass}
          option={opt}
          active={opt.vehicleClass === activeClass}
          onPress={() => onSelect(opt.vehicleClass)}
        />
      ))}

      {fares.isFetching ? (
        <View style={styles.refreshing}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={styles.refreshingText}>Updating prices…</Text>
        </View>
      ) : null}
    </View>
  );
}

function PaymentStep({
  option,
  value,
  onChange,
  onChangeVehicle,
}: {
  option: FareOption | null;
  value: PaymentMode;
  onChange: (m: PaymentMode) => void;
  onChangeVehicle: () => void;
}) {
  const info = option ? vehicleClassInfo(option.vehicleClass) : null;

  return (
    <View style={styles.list}>
      {/* What was chosen, restated with a way back. Payment is the last thing
          before money moves, so the vehicle and the amount have to be visible
          here rather than remembered from the previous step. */}
      {option && info ? (
        <View style={styles.chosen}>
          <View style={styles.chosenIcon}>
            <Text style={{ fontSize: 20 }}>🚗</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chosenLabel}>{info.label}</Text>
            <Text style={styles.chosenMeta}>{info.seats} seats</Text>
          </View>
          <View style={styles.chosenRight}>
            <Text style={styles.chosenPrice}>₹{option.total}</Text>
            <Pressable onPress={onChangeVehicle} hitSlop={8}>
              <Text style={styles.chosenChange}>Change</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {PAYMENT_MODES.map((m) => {
        const active = value === m.key;
        return (
          <Pressable
            key={m.key}
            style={[styles.payRow, active && styles.payRowActive]}
            onPress={() => onChange(m.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.payIcon, active && styles.payIconActive]}>
              <Text style={{ fontSize: 17 }}>{m.glyph}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.payLabel}>{m.label}</Text>
              <Text style={styles.payHint}>{m.hint}</Text>
            </View>

            <View style={[styles.radio, active && styles.radioActive]}>
              {active ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}

      <Text style={styles.payNote}>
        The exact advance amount is confirmed on the next screen, before any payment is taken.
      </Text>
    </View>
  );
}

/* -------------------------------- Subviews --------------------------------- */

function StepDot({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, (active || done) && styles.stepDotOn]}>
        <Text style={[styles.stepNum, (active || done) && styles.stepNumOn]}>
          {done ? '✓' : index}
        </Text>
      </View>
      <Text style={[styles.stepLabel, active && styles.stepLabelOn]}>{label}</Text>
    </View>
  );
}

function FareRow({
  option,
  active,
  onPress,
}: {
  option: FareOption;
  active: boolean;
  onPress: () => void;
}) {
  const info = vehicleClassInfo(option.vehicleClass);
  const eta = option.quote?.durationMin;
  return (
    <Pressable
      style={[styles.fareRow, active && styles.fareRowActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.fareIcon, active && styles.fareIconActive]}>
        <Text style={{ fontSize: 22 }}>🚗</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fareLabel, active && styles.fareLabelActive]}>{info.label}</Text>
        <Text style={styles.fareMeta}>
          {info.seats} seats{eta ? ` · ${Math.round(eta)} min away` : ''}
        </Text>
        {info.description ? (
          <Text style={styles.fareDesc} numberOfLines={1}>
            {info.description}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.farePrice, active && styles.farePriceActive]}>₹{option.total}</Text>
    </Pressable>
  );
}

function SkeletonRow() {
  return (
    <View style={styles.fareRow}>
      <View style={[styles.fareIcon, styles.skeleton]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[styles.skeleton, { height: 16, width: '50%', borderRadius: 6 }]} />
        <View style={[styles.skeleton, { height: 12, width: '30%', borderRadius: 6 }]} />
      </View>
      <View style={[styles.skeleton, { height: 18, width: 54, borderRadius: 6 }]} />
    </View>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorCard}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.retryBtn}>
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Full-screen, behind the sheet — exactly as on Home.
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  backFab: {
    position: 'absolute',
    left: spacing.lg,
    // Clears the status bar the same way Home's top pills do.
    top: (StatusBar.currentHeight ?? 40) + 8,
    zIndex: 30,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  backFabGlyph: { ...type.title, fontSize: 24, color: colors.text, lineHeight: 28 },

  /**
   * Padding INSIDE the draggable sheet. The sheet supplies its own surface,
   * rounded corners and drag handle, so nothing here should try to redraw them.
   *
   * The bottom clearance has to cover TWO things, which is what the earlier
   * 150 missed:
   *   · the pinned footer (~110pt) floating over the sheet, and
   *   · the 40pt the sheet's own body deliberately extends past the screen
   *     edge (its wrapper is containerHeight - FULL + 40), which is off-screen
   *     even when fully expanded.
   * Anything less and the last row sits under the footer or below the fold,
   * with no way to scroll it into view.
   */
  sheetContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: FOOTER_CLEARANCE,
  },

  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  step: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepDotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { ...type.caption, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepNumOn: { color: colors.primaryText },
  stepLabel: { ...type.caption, fontSize: 10, color: colors.textMuted },
  stepLabelOn: { color: colors.text, fontWeight: '700' },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    // Sits level with the dots, not the labels under them.
    marginBottom: 16,
  },
  stepLineDone: { backgroundColor: colors.primary },

  heading: { ...type.title, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: spacing.xs },

  list: { gap: spacing.md, marginTop: spacing.lg },

  fareRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  fareRowActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#FFFBEF' },
  fareIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  fareIconActive: { backgroundColor: 'rgba(255,193,7,0.22)' },
  fareLabel: { ...type.label, color: colors.text, fontSize: 16 },
  fareLabelActive: { color: colors.text },
  fareMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  fareDesc: { ...type.caption, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  farePrice: { ...type.title, color: colors.text, fontSize: 18 },
  farePriceActive: { color: colors.text },

  refreshing: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    justifyContent: 'center', paddingTop: spacing.sm,
  },
  refreshingText: { ...type.caption, color: colors.textMuted },

  chosen: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.md,
  },
  chosenIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  chosenLabel: { ...type.label, fontSize: 15, color: colors.text },
  chosenMeta: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  chosenRight: { alignItems: 'flex-end' },
  chosenPrice: { ...type.title, fontSize: 17, color: colors.text },
  chosenChange: { ...type.caption, fontSize: 11, color: '#8A6D0B', fontWeight: '700', marginTop: 2 },

  payRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  payRowActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#FFFBEF' },
  payIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  payIconActive: { backgroundColor: 'rgba(255,193,7,0.22)' },
  payLabel: { ...type.label, color: colors.text },
  payHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  payNote: { ...type.caption, color: colors.textMuted, lineHeight: 17, marginTop: spacing.xs },

  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  errorCard: {
    marginTop: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'flex-start',
  },
  errorText: { ...type.body, color: colors.text },
  retryBtn: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  retryText: { ...type.label, color: colors.text },

  submitError: { ...type.body, color: colors.danger, marginTop: spacing.lg },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
  },
  backBtn: {
    width: 52, height: 52, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
  },
  backBtnText: { ...type.title, fontSize: 22, color: colors.text, lineHeight: 26 },
  cta: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  skeleton: { backgroundColor: colors.surfaceAlt },
});