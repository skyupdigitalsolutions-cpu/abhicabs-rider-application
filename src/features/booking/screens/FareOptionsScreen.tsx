/**
 * src/features/booking/screens/FareOptionsScreen.tsx
 *
 * Stage two of the booking flow. Given the drafted route, it quotes every
 * vehicle class (one backend call), lets the rider pick a class and a payment
 * mode, and creates the booking. On success it resets the draft and hands off to
 * the Trip screen, which takes over with the live view.
 *
 * "No waiting" here means: the fare query is cached by route signature, so
 * arriving from Home paints instantly if the same route was quoted moments ago;
 * a genuine first load shows skeleton rows, never a blank screen; and Continue
 * shows an inline spinner on the button rather than blocking the page.
 */

import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useFareOptions, useCreateBooking } from '../api';
import { vehicleClassInfo } from '../../../config/catalog';
import { AbhiApiError } from '../../../types/api';
import type { FareOptionsScreenProps } from '../../../navigation/types';
import type { FareOption, PaymentMode } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

const PAYMENT_MODES: { key: PaymentMode; label: string; hint: string }[] = [
  { key: 'FULL', label: 'Pay full', hint: 'Pay the whole fare now' },
  { key: 'PARTIAL', label: 'Pay advance', hint: 'Pay a part now, rest later' },
  { key: 'ZERO', label: 'Pay later', hint: 'Nothing now, pay after the ride' },
];

export function FareOptionsScreen({ navigation }: FareOptionsScreenProps) {
  const draft = useBookingDraft();
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('FULL');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fares = useFareOptions({
    cityId: draft.cityId,
    tripType: draft.tripType,
    pickup: draft.pickup,
    drop: draft.drop,
    pickupAt: draft.pickupAt,
    returnAt: draft.returnAt,
    rentalPackageId: draft.rentalPackageId,
    rentalHours: draft.rentalHours,
    flightNumber: draft.flightNumber,
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

  const onContinue = async () => {
    if (!activeClass || !draft.pickup || !draft.drop) return;
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
        pickup: { lat: draft.pickup.lat, lng: draft.pickup.lng },
        drop: { lat: draft.drop.lat, lng: draft.drop.lng },
        pickupAt,
        ...(returnAt ? { returnAt } : {}),
        ...(draft.rentalPackageId ? { rentalPackageId: draft.rentalPackageId } : {}),
        ...(draft.rentalHours ? { rentalHours: draft.rentalHours } : {}),
        ...(draft.flightNumber ? { flightNumber: draft.flightNumber } : {}),
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Choose your ride</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {draft.pickup?.label ?? 'Pickup'} → {draft.drop?.label ?? 'Drop'}
        </Text>

        {/* Fare options */}
        {fares.isLoading ? (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {[0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          </View>
        ) : fares.isError ? (
          <ErrorCard
            message={
              fares.error instanceof AbhiApiError
                ? fares.error.message
                : 'Could not load fares for this route.'
            }
            onRetry={() => fares.refetch()}
          />
        ) : options.length === 0 ? (
          <ErrorCard message="No rides available for this route right now." onRetry={() => fares.refetch()} />
        ) : (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {options.map((opt) => (
              <FareRow
                key={opt.vehicleClass}
                option={opt}
                active={opt.vehicleClass === activeClass}
                onPress={() => setSelectedClass(opt.vehicleClass)}
              />
            ))}
            {fares.isFetching ? (
              <View style={styles.refreshing}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.refreshingText}>Updating prices…</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Payment mode */}
        {options.length > 0 ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Text style={styles.sectionLabel}>Payment</Text>
            {PAYMENT_MODES.map((m) => (
              <Pressable
                key={m.key}
                style={[styles.payRow, paymentMode === m.key && styles.payRowActive]}
                onPress={() => setPaymentMode(m.key)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payLabel}>{m.label}</Text>
                  <Text style={styles.payHint}>{m.hint}</Text>
                </View>
                <View style={[styles.radio, paymentMode === m.key && styles.radioActive]}>
                  {paymentMode === m.key ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
      </ScrollView>

      {/* Sticky footer CTA */}
      {options.length > 0 ? (
        <View style={styles.footer}>
          <Pressable
            style={[styles.cta, (!activeClass || create.isPending) && styles.ctaDisabled]}
            disabled={!activeClass || create.isPending}
            onPress={onContinue}
          >
            {create.isPending ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.ctaText}>
                Book {activeClass ? vehicleClassInfo(activeClass).label : ''}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------- Subviews --------------------------------- */

function FareRow({ option, active, onPress }: { option: FareOption; active: boolean; onPress: () => void }) {
  const info = vehicleClassInfo(option.vehicleClass);
  const eta = option.quote?.durationMin;
  return (
    <Pressable style={[styles.fareRow, active && styles.fareRowActive]} onPress={onPress}>
      <View style={styles.fareIcon}>
        <Text style={{ fontSize: 22 }}>🚗</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fareLabel}>{info.label}</Text>
        <Text style={styles.fareMeta}>
          {info.seats} seats{eta ? ` · ${Math.round(eta)} min` : ''}
        </Text>
      </View>
      <Text style={styles.farePrice}>₹{option.total}</Text>
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
  content: { padding: spacing.xl, paddingBottom: 140 },
  heading: { ...type.title, color: colors.text },
  sub: { ...type.body, color: colors.textMuted, marginTop: spacing.xs },
  sectionLabel: { ...type.label, color: colors.textMuted, marginBottom: spacing.xs },

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
  fareLabel: { ...type.label, color: colors.text, fontSize: 16 },
  fareMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  farePrice: { ...type.title, color: colors.text, fontSize: 18 },

  refreshing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingTop: spacing.sm },
  refreshingText: { ...type.caption, color: colors.textMuted },

  payRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.lg,
  },
  payRowActive: { borderColor: colors.primary },
  payLabel: { ...type.label, color: colors.text },
  payHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
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
  retryBtn: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { ...type.label, color: colors.text },

  submitError: { ...type.body, color: colors.danger, marginTop: spacing.lg },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  skeleton: { backgroundColor: colors.surfaceAlt },
});