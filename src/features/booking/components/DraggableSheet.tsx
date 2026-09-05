/**
 * src/features/booking/components/DraggableSheet.tsx
 *
 * Draggable bottom sheet on Animated + PanResponder (no native gesture libs).
 * Grab ANYWHERE on the sheet to drag it — over the packages grid, over the
 * flight-number TextInput, anywhere — while the body still scrolls when needed.
 *
 * The trick is capturing the gesture in the CAPTURE phase, before any child
 * (ScrollView or TextInput) can claim it. Taps still reach children because we
 * only capture on MOVE, never on the initial touch-down.
 *
 *   • Not full → any vertical drag moves the sheet.
 *   • Full + content at top → pull DOWN moves the sheet; up scrolls.
 *   • Full + scrolled → the body scrolls.
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, spacing } from '../../../theme';

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
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const snapTo = (to: number, name: SnapName) => {
    restY.current = to;
    snapRef.current = name;
    onSnap?.(name);
    Animated.spring(translateY, {
      toValue: to, useNativeDriver: true, damping: 24, stiffness: 240, mass: 0.7,
    }).start();
  };

  useEffect(() => {
    translateY.setValue(HALF);
    restY.current = HALF;
    snapRef.current = 'half';
    onSnap?.('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared decision: should the sheet take this vertical drag?
  const shouldDrag = (dy: number, dx: number) => {
    const vertical = Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8;
    if (!vertical) return false;
    const atFull = snapRef.current === 'full';
    const draggingDown = dy > 0;
    const atTop = scrollY.current <= 0;
    if (!atFull) return true;                 // half → any vertical drag moves sheet
    return draggingDown && atTop;             // full → pull-down from top moves sheet
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Let taps through to children (TextInput focus, buttons). Decide on move.
        onStartShouldSetPanResponderCapture: () => false,
        // Capture the MOVE before ScrollView/TextInput can — this is what makes
        // "drag from anywhere" work on every tab, including over the TextInput.
        onMoveShouldSetPanResponderCapture: (_e, g) => shouldDrag(g.dy, g.dx),
        onMoveShouldSetPanResponder: (_e, g) => shouldDrag(g.dy, g.dx),
        onPanResponderGrant: () => setScrollEnabled(false),
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
          snapTo(toFull ? FULL : HALF, toFull ? 'full' : 'half');
          setScrollEnabled(true);
        },
        onPanResponderTerminate: () => setScrollEnabled(true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [FULL, HALF],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
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