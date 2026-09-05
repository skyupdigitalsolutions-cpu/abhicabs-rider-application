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
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors } from '../../../theme';

const { height: SCREEN_H } = Dimensions.get('window');

export type SnapName = 'full' | 'half' | 'peek';

interface Props {
  children: React.ReactNode;
  contentContainerStyle?: object;
  snapFull?: number;
  snapHalf?: number;
  onSnap?: (snap: SnapName) => void;
}

export function DraggableSheet({
  children,
  contentContainerStyle,
  snapFull = 0.06,
  snapHalf = 0.48,
  onSnap,
}: Props) {
  const FULL = Math.round(SCREEN_H * snapFull);
  const HALF = Math.round(SCREEN_H * snapHalf);

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
      style={[styles.sheet, { height: SCREEN_H - FULL + 40, transform: [{ translateY }] }]}
      {...pan.panHandlers}
    >
      <View style={styles.header}>
        <View style={styles.handle} />
      </View>

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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, top: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  header: { height: 40, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.border },
  body: { flex: 1 },
});