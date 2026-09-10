/**
 * src/features/trip/screens/TripScreen.tsx
 *
 * The live trip view. Reads the booking summary (one aggregate call) and updates
 * live via the socket, which patches the same cached summary as events arrive —
 * so the status, driver, and live position here move in real time without this
 * screen polling or managing socket state itself.
 *
 * The immersive map (react-native-maps) sits at the top for live trips, showing
 * pickup, drop, and the driver's current position. It requires a dev build, not
 * Expo Go. Below it: the status timeline, driver card, payment prompt, route and
 * fare. Terminal trips drop the map and show the summary layout only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Linking, Modal, Platform,
  Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useTripSummary, useCancelTrip, usePayTrip } from '../api';
import { TripMap } from '../components/TripMap';
import { DraggableSheet, type SnapName } from '../../booking/components/DraggableSheet';
import { isTerminal } from '../../../types/domain';
import type { TripScreenProps } from '../../../navigation/types';
import type { BookingStatus, BookingSummary } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

/** Same offset formula the home screen uses for its floating top pills. */
const TOP_OFFSET = (StatusBar.currentHeight ?? 40) + 20;

/** The forward lifecycle we render as a timeline (terminal states handled apart). */
const TIMELINE: { key: BookingStatus; label: string; caption: string }[] = [
  { key: 'PENDING', label: 'Requested', caption: 'Finding you a ride' },
  { key: 'CONFIRMED', label: 'Confirmed', caption: 'Booking confirmed' },
  { key: 'ALLOCATED', label: 'Driver assigned', caption: 'A driver is on the way to you' },
  { key: 'EN_ROUTE', label: 'Arriving', caption: 'Driver heading to pickup' },
  { key: 'ONGOING', label: 'On trip', caption: 'Enjoy your ride' },
  { key: 'ARRIVED', label: 'Arrived', caption: 'Reached destination — please pay' },
  { key: 'COMPLETED', label: 'Completed', caption: 'Trip finished' },
];

const ORDER: Record<BookingStatus, number> = {
  ATTEMPTED: -1, PENDING: 0, CONFIRMED: 1, ALLOCATED: 2, EN_ROUTE: 3,
  ONGOING: 4, ARRIVED: 5, COMPLETED: 6, CANCELLED: 99, EXPIRED: 99,
};

export function TripScreen({ route, navigation }: TripScreenProps) {
  const { bookingId } = route.params;
  const { data, isLoading, isError, refetch } = useTripSummary(bookingId);
  const cancel = useCancelTrip(bookingId);
  const pay = usePayTrip(bookingId);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<SnapName>('half');

  // Cancellation reason capture (required by the backend).
  const [reasonOpen, setReasonOpen] = useState(false);
  const [chosenReason, setChosenReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  /**
   * Scrolls the cancellation sheet to the free-text box when "Other" is
   * chosen — it sits at the very bottom, exactly where the keyboard lands.
   *
   * MUST be declared here, above the isLoading / isError early returns below.
   * Hooks after a conditional return run on some renders and not others, and
   * React counts them positionally: the loading pass would run 29 hooks and
   * the loaded pass 30, which throws "Rendered more hooks than during the
   * previous render".
   */
  const reasonScrollRef = useRef<ScrollView>(null);

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <TopBar light={false} onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.text} size="large" />
        <Text style={styles.centerText}>Loading your trip…</Text>
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={styles.center}>
        <TopBar light={false} onBack={() => navigation.goBack()} />
        <Text style={styles.centerText}>Couldn't load this trip.</Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const status = data.booking.status;
  const terminal = isTerminal(status);
  const canCancel = ['PENDING', 'CONFIRMED', 'ALLOCATED'].includes(status);

  // Outstanding balance and whether the rider is being asked to pay right now.
  const balanceDue = Number(data.booking.balanceDue ?? 0);
  const isPaid = data.payments.some(
    (p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_PAID',
  );
  const awaitingPayment = status === 'ARRIVED' && balanceDue > 0 && !isPaid;

  const onPay = async () => {
    setPaying(true);
    try {
      await pay.mutateAsync();
    } catch {
      /* surfaced below */
    } finally {
      setPaying(false);
    }
  };

  const CANCEL_REASONS = [
    'Plans changed',
    'Booked by mistake',
    'Driver is taking too long',
    'Found another ride',
    'Other',
  ];

  const resolvedReason =
    chosenReason === 'Other' ? otherText.trim() : (chosenReason ?? '');
  const reasonValid = resolvedReason.length >= 3;

  const onCancel = () => {
    setChosenReason(null);
    setOtherText('');
    setReasonOpen(true);
  };

  const confirmCancel = async () => {
    if (!reasonValid) return;
    setReasonOpen(false);
    setCancelling(true);
    try {
      await cancel.mutateAsync(resolvedReason);
    } catch {
      /* surfaced below */
    } finally {
      setCancelling(false);
    }
  };

  const chooseReason = (r: string) => {
    setChosenReason(r);
    if (r === 'Other') {
      // After the input has mounted and the sheet has re-measured.
      setTimeout(() => reasonScrollRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const reasonModal = (
    <Modal visible={reasonOpen} transparent animationType="fade" onRequestClose={() => setReasonOpen(false)}>
      {/*
        On iOS nothing moves for the keyboard unless we ask, hence 'padding'.
        On Android the window resizes on its own (softwareKeyboardLayoutMode
        defaults to "resize"), so adding padding here as well would push the
        sheet up twice and leave a gap under it.
      */}
      <KeyboardAvoidingView
        style={styles.reasonAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.reasonBackdrop} onPress={() => setReasonOpen(false)}>
          <Pressable style={styles.reasonSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              ref={reasonScrollRef}
              contentContainerStyle={styles.reasonScrollBody}
              // Without this, the first tap on an option only dismisses the
              // keyboard and the rider has to tap everything twice.
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.reasonTitle}>Why are you cancelling?</Text>
              <Text style={styles.reasonSubtitle}>This helps us improve. A cancellation fee may apply depending on timing.</Text>

              {CANCEL_REASONS.map((r) => {
                const selected = chosenReason === r;
                return (
                  <Pressable
                    key={r}
                    style={[styles.reasonOption, selected && styles.reasonOptionSelected]}
                    onPress={() => chooseReason(r)}
                  >
                    <Text style={[styles.reasonOptionText, selected && styles.reasonOptionTextSelected]}>{r}</Text>
                  </Pressable>
                );
              })}

              {chosenReason === 'Other' ? (
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Tell us briefly (min 3 characters)"
                  placeholderTextColor={colors.textMuted}
                  value={otherText}
                  onChangeText={setOtherText}
                  multiline
                  autoFocus
                  onFocus={() => setTimeout(() => reasonScrollRef.current?.scrollToEnd({ animated: true }), 120)}
                />
              ) : null}

              <Pressable
                style={[styles.reasonSubmit, !reasonValid && styles.reasonSubmitDisabled]}
                disabled={!reasonValid}
                onPress={confirmCancel}
              >
                <Text style={styles.reasonSubmitText}>Cancel trip</Text>
              </Pressable>
              <Pressable style={styles.reasonKeep} onPress={() => setReasonOpen(false)}>
                <Text style={styles.reasonKeepText}>Keep trip</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );

  // Live trips (not terminal) with valid pickup/drop coords get the immersive,
  // full-screen map — same treatment as the home screen. Coords arrive as
  // strings from the API, so coerce before the finite check.
  const pLat = Number(data.booking.pickupLat);
  const pLng = Number(data.booking.pickupLng);
  const dLat = Number(data.booking.dropLat);
  const dLng = Number(data.booking.dropLng);
  const hasCoords = [pLat, pLng, dLat, dLng].every(Number.isFinite);
  const hasLiveMap = !terminal && hasCoords;

  // Everything except the map itself — shared between the immersive layout
  // (map behind a draggable sheet) and the plain fallback (terminal trips /
  // missing coords), so the two layouts never drift apart.
  const info = (
    <>
      {/* Status header */}
      <View style={styles.header}>
        <StatusPill status={status} />
        <Text style={styles.bookingNo}>#{data.booking.bookingNumber}</Text>
      </View>

      {terminal ? (
        <TerminalCard status={status} />
      ) : (
        <Timeline status={status} />
      )}

      {/* Driver / vehicle card once allocated */}
      {data.allocation && !terminal ? (
        <DriverCard summary={data} />
      ) : null}

      {/* Payment prompt at the ARRIVED step */}
      {awaitingPayment ? (
        <View style={[styles.card, styles.payCard]}>
          <Text style={styles.payTitle}>Payment due</Text>
          <Text style={styles.payBody}>
            Your driver has reached the destination. Pay to finish the trip.
          </Text>
          <View style={styles.payAmountRow}>
            <Text style={styles.payAmountLabel}>Amount</Text>
            <Text style={styles.payAmount}>₹{balanceDue.toFixed(2)}</Text>
          </View>
          <Pressable style={styles.payBtn} onPress={onPay} disabled={paying}>
            {paying ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.payBtnText}>Pay ₹{balanceDue.toFixed(2)}</Text>
            )}
          </Pressable>
          {pay.isError ? (
            <Text style={styles.errText}>Payment failed. Please try again.</Text>
          ) : null}
        </View>
      ) : null}

      {/* Waiting-to-finish note: paid, at destination, not yet completed */}
      {status === 'ARRIVED' && !awaitingPayment ? (
        <View style={[styles.card, { alignItems: 'center' }]}>
          <Text style={styles.payTitle}>Payment received</Text>
          <Text style={styles.payBody}>Finishing your trip…</Text>
        </View>
      ) : null}

      {/* Local rental — package, included hours/km, rate, and time remaining. */}
      {data.booking.tripType === 'HOURLY' ? <RentalCard booking={data.booking} /> : null}

      {/* Route */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Route</Text>
        <RouteRow dot={colors.primary} label="Pickup" value={data.booking.pickupAddress} />
        <View style={styles.routeDivider} />
        <RouteRow dot={colors.text} label="Drop" value={data.booking.dropAddress} />
      </View>

      {/* Fare */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fare</Text>
        <Row label="Vehicle" value={data.booking.vehicleClass} />
        {data.booking.distanceKm != null ? (
          <Row label="Distance" value={`${Number(data.booking.distanceKm).toFixed(1)} km`} />
        ) : null}
        <Row
          label={data.booking.finalFare ? 'Total' : 'Estimated'}
          value={`₹${data.booking.finalFare ?? data.booking.estimatedFare ?? '—'}`}
          strong
        />
        <Row label="Payment" value={paymentModeLabel(data)} />
      </View>

      {/* Cancel */}
      {canCancel ? (
        <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={cancelling}>
          {cancelling ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.cancelText}>Cancel trip</Text>
          )}
        </Pressable>
      ) : null}

      {cancel.isError ? (
        <Text style={styles.errText}>Could not cancel. Please try again.</Text>
      ) : null}

      {terminal ? (
        <Pressable style={styles.homeBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.homeText}>Book another ride</Text>
        </Pressable>
      ) : null}
    </>
  );

  // Immersive layout: full-screen map behind a draggable sheet — same
  // composition as the home screen (SharedMap + DraggableSheet). No native
  // header here (see App.tsx), so the map runs edge-to-edge exactly like
  // the home screen, with our own transparent back button floating on top.
  if (hasLiveMap) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.mapLayer}>
          <TripMap
            pickup={{ lat: pLat, lng: pLng }}
            drop={{ lat: dLat, lng: dLng }}
            driver={
              data.liveLocation
                ? { lat: data.liveLocation.lat, lng: data.liveLocation.lng }
                : null
            }
            live
            fullBleed
            height={SCREEN_H}
          />
        </View>

        {/* Hide the back button once the sheet is fully expanded, same as
            the home screen hides its top pills — it would sit under the
            sheet otherwise. */}
        {sheetSnap !== 'full' ? (
          <TopBar light onBack={() => navigation.goBack()} />
        ) : null}

        <DraggableSheet onSnap={setSheetSnap} contentContainerStyle={styles.sheetContent}>
          {info}
        </DraggableSheet>
        {reasonModal}
      </View>
    );
  }

  // Fallback layout: terminal trips or missing coords — plain scroll, no map.
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <TopBar light={false} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        {info}
      </ScrollView>
      {reasonModal}
    </View>
  );
}

/** Transparent back button + title, floating over the content — no header, no
 * background pill, just like the home screen's overlay pattern but bare. */
function TopBar({ light, onBack }: { light: boolean; onBack: () => void }) {
  return (
    <View style={[styles.topOverlay, { top: TOP_OFFSET }]}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <Text style={[styles.backArrow, light ? styles.textLight : styles.textDark]}>←</Text>
      </Pressable>
      <Text style={[styles.topTitle, light ? styles.textLight : styles.textDark]}>Your trip</Text>
    </View>
  );
}

/* -------------------------------- Subviews --------------------------------- */

function StatusPill({ status }: { status: BookingStatus }) {
  const live = ['ALLOCATED', 'EN_ROUTE', 'ONGOING', 'ARRIVED'].includes(status);
  const bg = live ? colors.primary : status === 'CONFIRMED' ? colors.text : colors.surfaceAlt;
  const fg = live ? colors.primaryText : status === 'CONFIRMED' ? '#FFFFFF' : colors.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ ...type.label, color: fg }}>{humanStatus(status)}</Text>
    </View>
  );
}

function Timeline({ status }: { status: BookingStatus }) {
  const current = ORDER[status];
  return (
    <View style={styles.card}>
      {TIMELINE.map((step, i) => {
        const stepOrder = ORDER[step.key];
        const done = stepOrder < current;
        const active = stepOrder === current;
        const last = i === TIMELINE.length - 1;
        return (
          <View key={step.key} style={styles.tlRow}>
            <View style={styles.tlGutter}>
              <View style={[styles.tlDot, (done || active) && styles.tlDotActive, active && styles.tlDotCurrent]} />
              {!last ? <View style={[styles.tlLine, done && styles.tlLineActive]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.lg }}>
              <Text style={[styles.tlLabel, (done || active) && styles.tlLabelActive]}>{step.label}</Text>
              {active ? <Text style={styles.tlCaption}>{step.caption}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DriverCard({ summary }: { summary: BookingSummary }) {
  const a = summary.allocation!;
  const live = summary.liveLocation;
  const phone = a.driverPhone;
  return (
    <View style={styles.card}>
      <View style={styles.driverHead}>
        <View style={styles.avatar}><Text style={{ fontSize: 22 }}>🧑‍✈️</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driverName}>{a.driverName ?? 'Your driver'}</Text>
          <Text style={styles.driverVehicle}>{a.vehicleNumber ?? 'Vehicle assigned'}</Text>
        </View>
        {phone ? (
          <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
            <Text style={styles.callText}>Call</Text>
          </Pressable>
        ) : null}
      </View>
      {live ? (
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            Live · updated {live.lastPingAt ? timeAgo(live.lastPingAt) : 'just now'}
          </Text>
        </View>
      ) : (
        <Text style={styles.liveWaiting}>Waiting for driver's live location…</Text>
      )}
    </View>
  );
}

function TerminalCard({ status }: { status: BookingStatus }) {
  const map: Record<string, { icon: string; title: string; body: string }> = {
    COMPLETED: { icon: '✅', title: 'Trip completed', body: 'Thanks for riding with ABHICABS.' },
    CANCELLED: { icon: '🚫', title: 'Trip cancelled', body: 'This booking was cancelled.' },
    EXPIRED: { icon: '⌛', title: 'Booking expired', body: 'This booking expired before it was confirmed.' },
  };
  const m = map[status] ?? map.CANCELLED!;
  return (
    <View style={[styles.card, { alignItems: 'center', gap: spacing.sm }]}>
      <Text style={{ fontSize: 40 }}>{m.icon}</Text>
      <Text style={styles.cardTitle}>{m.title}</Text>
      <Text style={styles.termBody}>{m.body}</Text>
    </View>
  );
}

function RouteRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <View style={styles.routeRow}>
      <View style={[styles.routeDot, { backgroundColor: dot }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text style={styles.routeValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Local-rental summary: the chosen package (or flexible hours), what's included
 * (hours + km), the per-km rate for anything beyond the allowance, and a live
 * countdown of time remaining once the trip has started.
 *
 * All the package data is read from the booking's frozen fareBasis, so it always
 * reflects exactly what was quoted — never a later rate change.
 */
function RentalCard({ booking }: { booking: import('../../../types/domain').Booking }) {
  const comp = booking.fareBasis?.components;
  const meta = comp?.meta;
  const snap = comp?.configSnapshot;

  const includedHours = meta?.includedHours ?? booking.rentalHours ?? null;
  const includedKm = meta?.includedKm ?? null;
  const packageLabel =
    meta?.packageLabel ??
    (booking.rentalHours ? `${booking.rentalHours} hrs (flexible)` : 'Local rental');
  // Rate charged for distance beyond the included km.
  const extraPerKm = snap?.extraPerKm ?? snap?.perKm ?? null;

  const remaining = useRentalCountdown(booking, includedHours);

  return (
    <View style={styles.card}>
      <View style={styles.rentalHeaderRow}>
        <Text style={styles.cardTitle}>Local rental</Text>
        <View style={styles.rentalBadge}>
          <Text style={styles.rentalBadgeText}>{packageLabel}</Text>
        </View>
      </View>

      {/* Time remaining — the headline for an in-progress rental. */}
      {remaining ? (
        <View style={styles.remainingWrap}>
          <Text style={styles.remainingValue}>{remaining.label}</Text>
          <Text style={styles.remainingCaption}>{remaining.caption}</Text>
        </View>
      ) : null}

      {includedHours != null ? (
        <Row label="Included time" value={`${includedHours} hours`} />
      ) : null}
      {includedKm != null ? <Row label="Included distance" value={`${includedKm} km`} /> : null}
      {extraPerKm ? <Row label="Extra distance" value={`₹${extraPerKm} / km`} /> : null}
    </View>
  );
}

/**
 * Live "time remaining" for a rental. Counts down from (startedAt + includedHours)
 * once the trip is ONGOING; before start it shows the total window, after end it
 * shows "time's up". Ticks once a minute — a rental doesn't need second precision.
 */
function useRentalCountdown(
  booking: import('../../../types/domain').Booking,
  includedHours: number | null,
): { label: string; caption: string } | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (includedHours == null) return null;

  const windowMs = includedHours * 60 * 60 * 1000;

  // Before the trip starts, just show the package window.
  if (!booking.startedAt) {
    return { label: `${includedHours}h`, caption: 'Package time (starts at pickup)' };
  }

  const startedMs = new Date(booking.startedAt).getTime();
  const endMs = startedMs + windowMs;
  const leftMs = endMs - now;

  if (leftMs <= 0) {
    return { label: 'Time’s up', caption: 'Extra time may be charged' };
  }

  const totalMin = Math.floor(leftMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return { label, caption: 'Time remaining' };
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.kvValueStrong]}>{value}</Text>
    </View>
  );
}

/* -------------------------------- Helpers ---------------------------------- */

function humanStatus(s: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    ATTEMPTED: 'Processing', PENDING: 'Requested', CONFIRMED: 'Confirmed',
    ALLOCATED: 'Driver assigned', EN_ROUTE: 'Arriving', ONGOING: 'On trip',
    ARRIVED: 'Arrived', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
  };
  return map[s];
}

function paymentModeLabel(s: BookingSummary): string {
  const paid = s.payments.some((p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_PAID');
  return paid ? 'Paid' : s.booking.paymentMode === 'ZERO' ? 'Pay after ride' : 'Payment pending';
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

const styles = StyleSheet.create({
  reasonAvoider: { flex: 1 },
  reasonBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  reasonSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    // Caps the sheet so the backdrop is always tappable to dismiss, and —
    // more importantly — lets it SHRINK when the window resizes for the
    // keyboard. A fixed-height sheet would keep its size and push its own top
    // off screen, which is why the title and first options were being cut off.
    maxHeight: '88%',
    overflow: 'hidden',
  },
  // Padding lives on the scroll content, not the sheet: on the sheet it would
  // clip the scrollable area and the last option would sit under the edge.
  reasonScrollBody: {
    padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm,
  },
  reasonTitle: { ...type.title, color: colors.text },
  reasonSubtitle: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  reasonOption: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
  },
  reasonOptionSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  reasonOptionText: { ...type.body, color: colors.text },
  reasonOptionTextSelected: { color: colors.primary, fontWeight: '700' },
  reasonInput: {
    ...type.body, color: colors.text, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.lg, minHeight: 72, textAlignVertical: 'top',
  },
  reasonSubmit: {
    backgroundColor: colors.danger, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.sm,
  },
  reasonSubmitDisabled: { backgroundColor: colors.surfaceAlt },
  reasonSubmitText: { ...type.label, color: '#fff', fontSize: 16 },
  reasonKeep: { paddingVertical: spacing.md, alignItems: 'center' },
  reasonKeepText: { ...type.body, color: colors.textMuted },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: TOP_OFFSET + 52, gap: spacing.lg, paddingBottom: spacing.xxl + 56 },
  mapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheetContent: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl + 56, gap: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  topOverlay: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  backBtn: { padding: 4 },
  backArrow: { fontSize: 26, fontWeight: '600', lineHeight: 28 },
  topTitle: { ...type.title, fontSize: 18, fontWeight: '700' },
  textLight: { color: '#FFFFFF' },
  textDark: { color: colors.text },
  centerText: { ...type.body, color: colors.textMuted },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookingNo: { ...type.label, color: colors.textMuted },
  pill: { borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg,
  },
  cardTitle: { ...type.label, color: colors.textMuted, marginBottom: spacing.md },

  rentalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  rentalBadge: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  rentalBadgeText: { ...type.caption, color: colors.primaryText, fontWeight: '700' },
  remainingWrap: {
    alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
  },
  remainingValue: { ...type.display, fontSize: 32, color: colors.text },
  remainingCaption: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },

  // timeline
  tlRow: { flexDirection: 'row', gap: spacing.md },
  tlGutter: { width: 20, alignItems: 'center' },
  tlDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  tlDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  tlDotCurrent: { transform: [{ scale: 1.15 }] },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  tlLineActive: { backgroundColor: colors.primary },
  tlLabel: { ...type.body, color: colors.textMuted },
  tlLabelActive: { color: colors.text, fontWeight: '600' },
  tlCaption: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  // driver
  driverHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  driverName: { ...type.label, color: colors.text, fontSize: 16 },
  driverVehicle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  callBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  callText: { ...type.label, color: colors.primaryText },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  liveText: { ...type.caption, color: colors.text },
  liveWaiting: { ...type.caption, color: colors.textMuted, marginTop: spacing.md },

  // route
  routeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md, marginLeft: 22 },
  routeLabel: { ...type.caption, color: colors.textMuted },
  routeValue: { ...type.body, color: colors.text },

  // kv
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  kvLabel: { ...type.body, color: colors.textMuted },
  kvValue: { ...type.body, color: colors.text },
  kvValueStrong: { ...type.title, fontSize: 18 },

  termBody: { ...type.body, color: colors.textMuted, textAlign: 'center' },

  // payment prompt
  payCard: { borderColor: colors.primary },
  payTitle: { ...type.title, fontSize: 18, color: colors.text, marginBottom: spacing.xs },
  payBody: { ...type.body, color: colors.textMuted, marginBottom: spacing.md },
  payAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  payAmountLabel: { ...type.body, color: colors.textMuted },
  payAmount: { ...type.title, fontSize: 22, color: colors.text },
  payBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' },
  payBtnText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  cancelBtn: {
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  cancelText: { ...type.label, color: colors.danger },
  errText: { ...type.caption, color: colors.danger, textAlign: 'center' },

  homeBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center' },
  homeText: { ...type.label, color: colors.primaryText, fontSize: 16 },

  retryBtn: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { ...type.label, color: colors.text },
});