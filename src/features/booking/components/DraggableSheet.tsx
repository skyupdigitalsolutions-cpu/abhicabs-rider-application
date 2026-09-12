/**
 * src/features/booking/components/DraggableSheet.tsx
 *
 * Draggable bottom sheet on Animated + PanResponder (no native gesture libs).
 * Grab ANYWHERE on the sheet to drag it — over the packages grid, the route
 * card, the date row, anywhere — on every tab (Ride / Rental / Airport), and
 * drag it both up and down.
 *
 * The reliability trick: the inner ScrollView only scrolls when the content
 * ACTUALLY overflows the viewport. Tabs whose content fits (e.g. Rental with
 * no packages) never enable scrolling, so nothing competes with the drag and
 * the sheet moves freely in both directions. Only when content is taller than
 * the expanded sheet does scrolling turn on:
 *
 *   • Half                        → any vertical drag moves the sheet.
 *   • Full + content fits         → any vertical drag moves the sheet.
 *   • Full + overflows + at top   → pull DOWN moves the sheet; pull up scrolls.
 *   • Full + overflows + scrolled → the body scrolls.
 *
 * Two snaps: full (expanded) and half (default). onSnap reports the snap.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * Geometry exported so callers can position things relative to the sheet
 * without re-declaring its numbers. Duplicating 0.48 in a screen is how a pin
 * ends up half-buried the next time the snap point is tuned.
 */
export const SHEET_SNAP_HALF = 0.48;
export const SHEET_SNAP_FULL = 0.06;

/** Visible height of the promo strip above the sheet. */
const BANNER_HEIGHT = 44;
export const SHEET_BANNER_HEIGHT = BANNER_HEIGHT;
/** How much of the strip hides behind the sheet's rounded top. */
const BANNER_TUCK = 28;
/**
 * With a banner, the sheet cannot expand all the way to the top: the strip
 * lives ABOVE the card, so at the full snap it would slide under the status
 * bar and become unreadable. This floors the expanded position at enough room
 * for the status bar plus the strip.
 */
const MIN_FULL_WITH_BANNER = (StatusBar.currentHeight ?? 24) + BANNER_HEIGHT + 8;

export type SnapName = 'full' | 'half' | 'peek';

interface Props {
  children: React.ReactNode;
  contentContainerStyle?: object;
  snapFull?: number;
  snapHalf?: number;
  onSnap?: (snap: SnapName) => void;
  /**
   * Height of the sheet's own container, if it's not the full device window
   * (e.g. a screen with a visible header eating into the space). Snap
   * fractions are computed against this instead of the raw device height, so
   * the sheet's "half" position actually lands at half of what's visible.
   * Defaults to the full window height (correct when there's no header, as
   * on the home screen).
   */
  containerHeight?: number;
  /**
   * Optional strip rendered ABOVE the sheet's rounded top, riding the same
   * drag transform so it stays attached as the sheet moves.
   *
   * It is positioned outside the sheet's own box rather than as its first
   * child, so it does not consume content height and the sheet's snap maths
   * are untouched. Its lower edge tucks behind the sheet, which is what gives
   * the "label peeking out from under the card" look.
   */
  banner?: React.ReactNode;
  /**
   * Overrides on the sheet's own surface — in practice, its background.
   *
   * The home screen darkens it so the booking form can sit on top as a white
   * CARD with all four corners rounded. The sheet surface can only ever round
   * its top (its bottom runs off screen), so a rounded-bottom booking area has
   * to be a separate view drawn on a contrasting background.
   */
  surfaceStyle?: StyleProp<ViewStyle>;
  /** Drag handle tint, for when the surface is dark. */
  handleStyle?: StyleProp<ViewStyle>;
  /**
   * Show the drag handle and the 40px header row it sits in.
   *
   * Hiding it does NOT disable dragging — the pan responder is on the whole
   * sheet, so it still moves. It only removes the visual affordance, which is
   * a real cost: the handle is the standard signal that a sheet can be
   * dragged, and without it riders who have not tried it may never discover
   * the expanded state. Worth it only where the sheet's content already makes
   * that obvious.
   */
  showHandle?: boolean;
}

export function DraggableSheet({
  children,
  contentContainerStyle,
  banner,
  snapFull = SHEET_SNAP_FULL,
  snapHalf = SHEET_SNAP_HALF,
  onSnap,
  containerHeight = SCREEN_H,
  surfaceStyle,
  handleStyle,
  showHandle = true,
}: Props) {
  const FULL = banner
    ? Math.max(Math.round(containerHeight * snapFull), MIN_FULL_WITH_BANNER)
    : Math.round(containerHeight * snapFull);
  const HALF = Math.round(containerHeight * snapHalf);

  const translateY = useRef(new Animated.Value(HALF)).current;
  const restY = useRef(HALF);
  const snapRef = useRef<SnapName>('half');
  const scrollY = useRef(0);

  // Measured sizes decide whether the body can scroll at all.
  const contentH = useRef(0);
  const viewportH = useRef(0);
  const canScrollRef = useRef(false);
  const draggingRef = useRef(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);

  // Scroll only when expanded AND content overflows AND not mid-drag. Any tab
  // whose content fits stays fully drag-able in both directions.
  const recompute = () => {
    canScrollRef.current = contentH.current > viewportH.current + 1;
    setScrollEnabled(snapRef.current === 'full' && canScrollRef.current && !draggingRef.current);
  };

  const snapTo = (to: number, name: SnapName) => {
    restY.current = to;
    snapRef.current = name;
    if (name !== 'full') scrollY.current = 0;
    onSnap?.(name);
    recompute();
    Animated.spring(translateY, {
      toValue: to, useNativeDriver: true, damping: 24, stiffness: 240, mass: 0.7,
    }).start();
  };

  useEffect(() => {
    translateY.setValue(HALF);
    restY.current = HALF;
    snapRef.current = 'half';
    recompute();
    onSnap?.('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Should the sheet take this vertical drag (vs. letting the body scroll)?
  const shouldDrag = (dy: number, dx: number) => {
    const vertical = Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6;
    if (!vertical) return false;
    if (snapRef.current !== 'full') return true;   // half → any vertical drag moves the sheet
    if (!canScrollRef.current) return true;         // full but content fits → any drag moves it (so it collapses)
    return dy > 0 && scrollY.current <= 0;          // full + scrollable → only a pull-down from the top drags
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Let taps through to children (buttons, TextInput focus). Decide on move.
        onStartShouldSetPanResponderCapture: () => false,
        // Capture the MOVE before a child can — "drag from anywhere".
        onMoveShouldSetPanResponderCapture: (_e, g) => shouldDrag(g.dy, g.dx),
        onMoveShouldSetPanResponder: (_e, g) => shouldDrag(g.dy, g.dx),
        onPanResponderGrant: () => {
          draggingRef.current = true;
          setScrollEnabled(false);
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.min(HALF, Math.max(FULL, restY.current + g.dy));
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const landed = restY.current + g.dy;
          const mid = (FULL + HALF) / 2;
          let toFull: boolean;
          if (g.vy < -0.4) toFull = true;
          else if (g.vy > 0.4) toFull = false;
          else toFull = landed < mid;
          draggingRef.current = false;
          snapTo(toFull ? FULL : HALF, toFull ? 'full' : 'half');
        },
        onPanResponderTerminate: () => {
          draggingRef.current = false;
          recompute();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [FULL, HALF],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  const onBodyLayout = (e: LayoutChangeEvent) => {
    viewportH.current = e.nativeEvent.layout.height;
    recompute();
  };

  const onContentSizeChange = (_w: number, h: number) => {
    contentH.current = h;
    recompute();
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          // The banner is a normal flow child sitting above the card, so the
          // whole wrapper is grown and shifted up by its height. Positioning
          // it outside the parent's bounds instead would risk Android
          // clipping it, and would leave translateY meaning two things.
          top: banner ? -BANNER_HEIGHT : 0,
          height: containerHeight - FULL + 40 + (banner ? BANNER_HEIGHT : 0),
          transform: [{ translateY }],
        },
      ]}
      {...pan.panHandlers}
    >
      {/* Drawn BEFORE the surface and with no elevation, so the card's own
          elevation lifts it over the strip's tucked-under lower edge. */}
      {banner ? <View style={styles.banner}>{banner}</View> : null}

      <View style={[styles.surface, surfaceStyle]}>
        {showHandle ? (
          <View style={styles.header}>
            <View style={[styles.handle, handleStyle]} />
          </View>
        ) : null}

        <ScrollView
          style={styles.body}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={onBodyLayout}
          onContentSizeChange={onContentSizeChange}
        >
          {children}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Transparent positioner. Holds the banner and the card, and owns the drag
  // transform so both move together.
  wrap: { position: 'absolute', left: 0, right: 0 },

  // The white card itself.
  surface: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    /**
     * Clip children to the rounded top.
     *
     * Without this the corners are only cosmetic: they round the surface's own
     * background, but anything drawn inside still paints over them. Scrolling
     * the body up puts square content into the curve — at the top of the
     * scroll it overlaps by 16px — and the rounded corner visibly disappears
     * behind it. Clipping makes the content slide UNDER the curve instead,
     * which is what a rounded sheet should look like.
     */
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },

  // Sits above the card. BANNER_TUCK of its height is hidden behind the card's
  // rounded top, so the amber reads as one piece with the sheet rather than a
  // separate floating bar.
  banner: {
    height: BANNER_HEIGHT + BANNER_TUCK,
    // Pulls the card up over the strip's lower edge, so the amber appears to
    // run under the sheet rather than butt against it.
    marginBottom: -BANNER_TUCK,
    paddingBottom: BANNER_TUCK,
    backgroundColor: colors.primary,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    flexDirection: 'row', alignItems: 'center',
  },
  header: { height: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border },
  body: { flex: 1 },
});