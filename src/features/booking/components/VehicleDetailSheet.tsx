/**
 * src/features/booking/components/VehicleDetailSheet.tsx
 *
 * The draggable detail panel that opens when a rider taps a vehicle: hero shot
 * on a lit turntable with arrow paging, an expandable description, a spec
 * overview, and a book bar pinned to the bottom.
 *
 * ---------------------------------------------------------------------------
 * THE DRAG
 * ---------------------------------------------------------------------------
 * Two resting positions, plus dismissal:
 *
 *   HALF  — where it opens. The hero and the name are visible without covering
 *           the list entirely, so the rider keeps their place.
 *   FULL  — dragged up. Specs and the book bar come into view.
 *   CLOSED— dragged down past the threshold, or flicked down fast.
 *
 * The gesture lives on the GRAB AREA (the handle and the hero), not on the
 * whole sheet. A PanResponder covering the scroll view would fight it for every
 * vertical touch, and the loser of that fight is always the user. Dragging the
 * top of a sheet is also the gesture people already have — it is where their
 * thumb goes.
 *
 * Release decides by velocity first, then position: a deliberate flick should
 * win even if it only travelled a few points, which is how a real sheet behaves.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { VehicleShowcase } from '../../../config/vehicles';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

/** The sheet's own height. Never the full screen — a strip of list stays visible. */
const SHEET_H = Math.round(SCREEN_H * 0.92);

/** Resting offsets, measured as "how far down from fully open". */
const SNAP_FULL = 0;
const SNAP_HALF = Math.round(SHEET_H * 0.34);
const CLOSED = SHEET_H;

/** Past this much drag, a release closes rather than snapping back. */
const DISMISS_AFTER = SNAP_HALF + 90;
/** A flick faster than this decides the outcome regardless of distance. */
const FLICK = 0.6;

const SHEET_PAD = spacing.lg;
/** Height of the pinned book bar, reserved as scroll clearance. */
const BAR_H = 96;
const STAGE_W = SCREEN_W - SHEET_PAD * 2;

interface Props {
  /** The vehicle to show. null closes the sheet. */
  vehicle: VehicleShowcase | null;
  onClose: () => void;
  /** Called by the book bar. Takes the rider somewhere a trip can be entered. */
  onBook?: () => void;
}

export function VehicleDetailSheet({ vehicle, onClose, onBook }: Props) {
  const visible = vehicle !== null;

  /**
   * Holds the last vehicle so the panel still has something to render on its
   * way out — binding straight to `vehicle` would blank the content mid-slide.
   */
  const [shown, setShown] = useState<VehicleShowcase | null>(vehicle);

  /** Current vertical offset. Driven by both the animations and the gesture. */
  const y = useRef(new Animated.Value(CLOSED)).current;
  /**
   * A JS mirror of `y`, kept current by a listener.
   *
   * The gesture needs to know where the sheet is the instant a finger lands.
   * Animated.Value has no synchronous getter, and stopAnimation's callback is
   * async — by the time it fired, the first few move events had already been
   * measured against a stale origin, which is what made the drag feel dead.
   */
  const liveY = useRef(CLOSED);
  /** Where the finger started, captured on grant. */
  const dragOrigin = useRef(SNAP_HALF);
  /** Which snap we are resting at, so a drag knows what it is moving from. */
  const snap = useRef(SNAP_HALF);

  useEffect(() => {
    const id = y.addListener(({ value }) => {
      liveY.current = value;
    });
    return () => y.removeListener(id);
  }, [y]);

  const [angle, setAngle] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setShown(vehicle);
      // Every vehicle opens on its first angle with the copy collapsed;
      // carrying the previous one's state over would be disorienting.
      setAngle(0);
      setExpanded(false);
    }
  }, [vehicle]);

  const animateTo = (to: number, then?: () => void) => {
    snap.current = to;
    Animated.timing(y, {
      toValue: to,
      duration: to === CLOSED ? 240 : 300,
      // Decelerating: covers most of the distance early then settles, which is
      // what reads as smooth rather than "fast then stop".
      easing: to === CLOSED ? Easing.bezier(0.4, 0, 0.68, 0.06) : Easing.bezier(0.22, 1, 0.36, 1),
      // NOT the native driver. A gesture drives this value with setValue on
      // every move, and setValue does not propagate to a node the native driver
      // has taken ownership of — the sheet simply would not follow the finger.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) then?.();
    });
  };

  useEffect(() => {
    if (!shown) return;
    if (visible) animateTo(SNAP_HALF);
    // Only tear down on a COMPLETED close. An interrupted animation usually
    // means the rider reopened mid-exit, and unmounting then kills the entrance.
    else animateTo(CLOSED, () => setShown(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shown]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Never claim the touch on start — taps on the arrows must still land.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
        // Once the drag is ours, keep it. Without this the ScrollView below can
        // claim the gesture mid-drag and the sheet stops following the finger.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          // Stop any in-flight snap, then start from where it actually is.
          y.stopAnimation();
          dragOrigin.current = liveY.current;
        },
        onPanResponderMove: (_, g) => {
          const next = dragOrigin.current + g.dy;
          // Clamped at the top so the sheet cannot be dragged past fully open
          // and leave a gap above it.
          y.setValue(Math.max(SNAP_FULL, Math.min(CLOSED, next)));
        },
        onPanResponderRelease: (_, g) => {
          const landed = dragOrigin.current + g.dy;

          // Velocity first: a deliberate flick wins over distance travelled.
          if (g.vy > FLICK) {
            if (snap.current === SNAP_FULL) return animateTo(SNAP_HALF);
            return onClose();
          }
          if (g.vy < -FLICK) return animateTo(SNAP_FULL);

          if (landed > DISMISS_AFTER) return onClose();
          // Otherwise settle at whichever snap is nearer.
          const midpoint = (SNAP_FULL + SNAP_HALF) / 2;
          animateTo(landed < midpoint ? SNAP_FULL : SNAP_HALF);
        },
      }),
    // Stable for the sheet's lifetime: the callbacks only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The dim tracks the sheet's actual position, so dragging it down lightens
  // the screen — the panel feels attached to the backdrop rather than sliding
  // over an unrelated layer.
  const backdropOpacity = y.interpolate({
    inputRange: [SNAP_FULL, CLOSED],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  if (!shown) return null;

  const angles = shown.angles;
  const multi = angles.length > 1;
  const current = angles[angle] ?? angles[0];

  const step = (d: number) => setAngle((i) => (i + d + angles.length) % angles.length);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close vehicle details"
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View style={[styles.sheet, { transform: [{ translateY: y }] }]}>
          {/* ---- grab area: handle + hero ------------------------------- */}
          <View {...pan.panHandlers}>
            <View style={styles.handle} />

            <View style={styles.stage}>
              {/* Two ellipses — a wide soft glow and a thin lit rim — so the
                  vehicle looks photographed on a turntable rather than pasted
                  onto a panel. */}
              <View style={styles.ringGlow} pointerEvents="none" />
              <View style={styles.ring} pointerEvents="none" />

              {current ? (
                <Image source={current.source} style={styles.heroImg} resizeMode="contain" />
              ) : (
                <Text style={styles.heroGlyph}>{shown.glyph}</Text>
              )}
            </View>

            {/* Arrow pager. Arrows rather than dots because the sheet is
                draggable: a horizontal swipe here would be a coin toss against
                the vertical gesture, so paging gets explicit targets. */}
            {multi ? (
              <View style={styles.pager}>
                <Pressable
                  onPress={() => step(-1)}
                  hitSlop={12}
                  style={styles.arrow}
                  accessibilityRole="button"
                  accessibilityLabel="Previous angle"
                >
                  <Text style={styles.arrowGlyph}>‹</Text>
                </Pressable>
                <Text style={styles.pagerLabel}>{current?.label}</Text>
                <Pressable
                  onPress={() => step(1)}
                  hitSlop={12}
                  style={styles.arrow}
                  accessibilityRole="button"
                  accessibilityLabel="Next angle"
                >
                  <Text style={styles.arrowGlyph}>›</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* ---- scrolling detail --------------------------------------- */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              <Text style={styles.titleLight}>ABHICABS </Text>
              <Text style={styles.titleBold}>{shown.name}</Text>
            </Text>

            <Text style={styles.desc} numberOfLines={expanded ? undefined : 2}>
              {shown.detail}
              {!expanded ? '' : ` ${shown.blurb}.`}
            </Text>
            <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8}>
              <Text style={styles.readMore}>{expanded ? 'Read less' : 'Read more'}</Text>
            </Pressable>

            <Text style={styles.section}>Overview</Text>

            <View style={styles.specRow}>
              <SpecCard icon="👤" label="Capacity" value={String(shown.seats)} unit="Seats" />
              <SpecCard icon="🧳" label="Luggage" value={shown.luggage} />
              <SpecCard
                icon="🔄"
                label="Angles"
                value={String(angles.length)}
                unit={multi ? 'Views' : 'View'}
              />
            </View>

            {/* Where a rental app puts the price. There is none to show here —
                a fare needs a route, a time and a trip type, none of which
                exist yet — so the slot says so plainly rather than inventing a
                number the quote step might not honour. */}
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Fare</Text>
              <View style={styles.fareRight}>
                <Text style={styles.fareValue}>Route based</Text>
                <Text style={styles.fareUnit}>/quoted at booking</Text>
              </View>
            </View>
          </ScrollView>

        </Animated.View>

        {/* ---- book bar -------------------------------------------------
            A SIBLING of the sheet, pinned to the screen. Inside the sheet it
            rode along with the drag, so at the half snap it sat below the
            screen edge and the rider could not book without expanding first.
            Out here it stays put and only fades with the dismissal. */}
        {onBook ? (
          <Animated.View style={[styles.bookBar, { opacity: backdropOpacity }]}>
              <Pressable
                style={styles.bookMain}
                onPress={onBook}
                accessibilityRole="button"
                accessibilityLabel={`Book a ride with ${shown.name}`}
              >
                <View style={styles.bookIcon}>
                  <Text style={styles.bookIconGlyph}>🚗</Text>
                </View>
                <Text style={styles.bookText}>Book a ride</Text>
                <Text style={styles.bookChevrons}>›››</Text>
              </Pressable>

              <Pressable
                style={styles.bookClose}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.bookCloseGlyph}>✕</Text>
              </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function SpecCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: string;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={styles.spec}>
      <Text style={styles.specIcon}>{icon}</Text>
      <Text style={styles.specLabel}>{label}</Text>
      <Text
        style={styles.specValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
        {unit ? <Text style={styles.specUnit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },

  sheet: {
    height: SHEET_H,
    backgroundColor: '#141416',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingTop: spacing.sm,
    overflow: 'hidden',
  },

  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: spacing.md,
  },

  stage: { height: 200, justifyContent: 'center', alignItems: 'center' },
  heroImg: { width: STAGE_W * 0.92, height: '92%' },
  heroGlyph: { fontSize: 72 },
  ringGlow: {
    position: 'absolute',
    bottom: 14,
    width: STAGE_W * 0.9,
    height: 76,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ring: {
    position: 'absolute',
    bottom: 22,
    width: STAGE_W * 0.74,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  arrow: { paddingHorizontal: 6 },
  arrowGlyph: { fontSize: 18, color: '#FFFFFF', lineHeight: 22 },
  pagerLabel: {
    ...type.caption,
    fontSize: 10,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.75)',
    minWidth: 54,
    textAlign: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SHEET_PAD,
    paddingTop: spacing.lg,
    // Clears the pinned book bar, so the fare row can scroll out from under it.
    paddingBottom: BAR_H + spacing.lg,
  },

  title: { marginBottom: spacing.sm },
  titleLight: { ...type.title, fontSize: 22, color: 'rgba(255,255,255,0.6)', fontWeight: '400' },
  titleBold: { ...type.title, fontSize: 22, color: '#FFFFFF', fontWeight: '700' },

  desc: { ...type.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },
  readMore: { ...type.label, fontSize: 13, color: '#FFFFFF', marginTop: 2 },

  section: { ...type.label, fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: spacing.xl },

  specRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  spec: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  specIcon: { fontSize: 18, marginBottom: spacing.xs },
  specLabel: { ...type.caption, fontSize: 10, color: colors.textMuted },
  specValue: { ...type.title, fontSize: 19, color: colors.text },
  specUnit: { ...type.caption, fontSize: 10, color: colors.textMuted, fontWeight: '400' },

  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  fareLabel: { ...type.body, fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  fareRight: { flexDirection: 'row', alignItems: 'baseline' },
  fareValue: { ...type.title, fontSize: 18, color: '#FFFFFF' },
  fareUnit: { ...type.caption, fontSize: 10, color: 'rgba(255,255,255,0.45)', marginLeft: 2 },

  bookBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: SHEET_PAD,
    paddingTop: spacing.md,
    // Clears the home indicator / gesture bar on tall phones.
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#141416',
  },
  bookMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.pill,
    padding: 6,
  },
  bookIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookIconGlyph: { fontSize: 20 },
  bookText: { ...type.label, fontSize: 15, color: '#FFFFFF', marginLeft: spacing.md, flex: 1 },
  bookChevrons: {
    ...type.label,
    fontSize: 16,
    color: colors.primary,
    letterSpacing: 2,
    marginRight: spacing.md,
  },

  bookClose: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  bookCloseGlyph: { fontSize: 18, color: 'rgba(255,255,255,0.8)' },
});