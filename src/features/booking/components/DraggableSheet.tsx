/**
 * src/features/booking/components/DraggableSheet.tsx
 *
 * A Rapido/Uber-style draggable bottom sheet on React Native's Animated +
 * PanResponder — no native gesture libs, so no rebuild.
 *
 * The whole sheet is draggable: grab ANYWHERE on the card to move it. It blends
 * dragging with the inner scroll the way real apps do:
 *   • Not expanded (below "full")     → any drag moves the sheet.
 *   • Expanded and scrolled to top    → dragging DOWN moves the sheet; dragging
 *                                       up scrolls the content.
 *   • Expanded and scrolled mid-list  → dragging scrolls the content normally.
 *
 * Snap points are translateY of the sheet's TOP edge (0 = screen top):
 *   full → covers the screen, half → default, peek → collapsed strip.
 * onSnap reports the active snap so the screen can hide overlay chrome.
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
  snapPeek?: number;
  onSnap?: (snap: SnapName) => void;
}

export function DraggableSheet({
  children,
  contentContainerStyle,
  snapFull = 0.08,
  snapHalf = 0.5,
  snapPeek = 0.82,
  onSnap,
}: Props) {
  const FULL = Math.round(SCREEN_H * snapFull);
  const HALF = Math.round(SCREEN_H * snapHalf);
  const PEEK = Math.round(SCREEN_H * snapPeek);

  const translateY = useRef(new Animated.Value(HALF)).current;
  const restY = useRef(HALF);
  const snapRef = useRef<SnapName>('half');
  const scrollY = useRef(0);            // current inner scroll offset
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const snapTo = (to: number, name: SnapName) => {
    restY.current = to;
    snapRef.current = name;
    onSnap?.(name);
    Animated.spring(translateY, {
      toValue: to,
      useNativeDriver: true,
      damping: 24, stiffness: 240, mass: 0.7,
    }).start();
  };

  useEffect(() => {
    translateY.setValue(HALF);
    restY.current = HALF;
    snapRef.current = 'half';
    onSnap?.('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nearest = (y: number, vy: number): { to: number; name: SnapName } => {
    const pts: { to: number; name: SnapName }[] = [
      { to: FULL, name: 'full' }, { to: HALF, name: 'half' }, { to: PEEK, name: 'peek' },
    ];
    let target = y;
    if (vy < -0.5) target = y - SCREEN_H * 0.3;
    else if (vy > 0.5) target = y + SCREEN_H * 0.3;
    return pts.reduce((a, b) => (Math.abs(b.to - target) < Math.abs(a.to - target) ? b : a));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Decide per-gesture whether WE drag the sheet or let the ScrollView scroll.
        onMoveShouldSetPanResponder: (_e, g) => {
          const vertical = Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 6;
          if (!vertical) return false;

          const atFull = snapRef.current === 'full';
          const draggingDown = g.dy > 0;
          const atTop = scrollY.current <= 0;

          // Not fully expanded → the sheet always moves (there's nothing above to
          // scroll into yet).
          if (!atFull) return true;

          // Fully expanded → only hijack for a pull-DOWN that starts at the very
          // top of the content; otherwise let the list scroll.
          return draggingDown && atTop;
        },
        onPanResponderGrant: () => {
          // Freeze the scroll while we're dragging the sheet.
          setScrollEnabled(false);
        },
        onPanResponderMove: (_e, g) => {
          const next = Math.min(PEEK, Math.max(FULL, restY.current + g.dy));
          translateY.setValue(next);
        },
        onPanResponderRelease: (_e, g) => {
          const landed = restY.current + g.dy;
          const { to, name } = nearest(landed, g.vy);
          snapTo(to, name);
          setScrollEnabled(true);
        },
        onPanResponderTerminate: () => setScrollEnabled(true),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [FULL, HALF, PEEK],
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
  header: { height: 30, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
  body: { flex: 1 },
});