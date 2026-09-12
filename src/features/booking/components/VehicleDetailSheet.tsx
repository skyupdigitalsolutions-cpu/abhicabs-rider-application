/**
 * src/features/booking/components/VehicleDetailSheet.tsx
 *
 * The off-canvas panel that slides up when a rider taps a vehicle on the
 * Vehicles screen. Shows that one vehicle large, with every angle swipeable at
 * full sheet width and the specs spelled out.
 *
 * ---------------------------------------------------------------------------
 * WHY A SHEET RATHER THAN A SECOND SCREEN
 * ---------------------------------------------------------------------------
 * Looking at a vehicle is a glance, not a destination. Pushing a route costs a
 * full navigation transition plus a back press to return to the grid the rider
 * was scanning — and they will usually open two or three in a row to compare.
 * A sheet keeps the grid alive underneath, dims it so the context is obviously
 * still there, and closes with a tap anywhere outside.
 *
 * Uses React Native's own <Modal>: it already renders above everything and
 * takes the Android hardware back button via onRequestClose for free.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { VehicleShowcase } from '../../../config/vehicles';
import { VehicleGallery } from './VehicleGallery';
import { colors, radius, spacing, type } from '../../../theme';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

/**
 * The sheet never covers the whole screen. Leaving a strip of the grid visible
 * is what makes it read as a panel over the app rather than a new page.
 */
const MAX_SHEET_H = Math.round(SCREEN_H * 0.8);

/** Gap between the top of the sheet and the floating close button. */
const CLOSE_GAP = 12;

const SHEET_PAD = spacing.xl;
const GALLERY_W = SCREEN_W - SHEET_PAD * 2;

interface Props {
  /** The vehicle to show. null closes the sheet. */
  vehicle: VehicleShowcase | null;
  onClose: () => void;
}

export function VehicleDetailSheet({ vehicle, onClose }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [sheetH, setSheetH] = useState(0);

  const visible = vehicle !== null;

  /**
   * Keeps the Modal mounted while the CLOSE animation plays, and holds on to
   * the last vehicle so the panel still has something to render on its way
   * out — binding straight to `vehicle` would blank the content mid-slide.
   */
  const [shown, setShown] = useState<VehicleShowcase | null>(vehicle);

  useEffect(() => {
    if (vehicle) setShown(vehicle);
  }, [vehicle]);

  useEffect(() => {
    if (!shown) return;

    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 320 : 240,
      // Decelerating curve: covers most of the distance early then settles,
      // which is what reads as smooth rather than "fast then stop".
      easing: visible ? Easing.bezier(0.22, 1, 0.36, 1) : Easing.bezier(0.4, 0, 0.68, 0.06),
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only tear down on a COMPLETED close. finished:false means another
      // animation interrupted — usually the rider opening a different vehicle
      // mid-exit, and unmounting then would kill the new entrance.
      if (finished && !visible) setShown(null);
    });
  }, [visible, shown, progress]);

  /**
   * Travel exactly the sheet's own height. Animating from MAX_SHEET_H would
   * leave a short sheet below the screen for the first part of the timeline,
   * then appear to jump in halfway.
   */
  const travel = sheetH || MAX_SHEET_H;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [travel, 0],
  });

  // The dim leads slightly ahead of the panel, so the screen is set aside
  // before the sheet arrives into it.
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0.9, 1],
  });

  // The close button arrives last, so it never floats in mid-air over a
  // half-open sheet.
  const closeOpacity = progress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [0, 0, 1],
  });

  if (!shown) return null;

  return (
    <Modal
      visible
      transparent
      // 'none' because the animation is ours. Letting Modal animate too would
      // compound the two and double the apparent duration.
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close vehicle details"
        >
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
        </Pressable>

        <Animated.View
          style={[
            styles.closeWrap,
            { bottom: sheetH + CLOSE_GAP, opacity: closeOpacity, transform: [{ translateY }] },
          ]}
          pointerEvents={sheetH > 0 ? 'auto' : 'none'}
        >
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeGlyph}>✕</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          onLayout={(e) => {
            // Guarded: onLayout fires on every re-layout, and writing an
            // unchanged height would re-render for nothing.
            const h = Math.round(e.nativeEvent.layout.height);
            setSheetH((prev) => (prev === h ? prev : h));
          }}
        >
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
          >
            {/* The artwork sits on its own lit stage, the same spotlight
                treatment as the grid card but at full width. */}
            <LinearGradient
              colors={['#262626', '#171717']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.stage}
            >
              <View style={styles.spotlight} pointerEvents="none" />
              <VehicleGallery
                angles={shown.angles}
                glyph={shown.glyph}
                width={GALLERY_W - spacing.md * 2}
                height={190}
              />
            </LinearGradient>

            <View style={styles.head}>
              <Text style={styles.name}>{shown.name}</Text>
              <View style={styles.seatBadge}>
                <Text style={styles.seatBadgeText}>{shown.seats} seats</Text>
              </View>
            </View>

            <Text style={styles.blurb}>{shown.blurb}</Text>

            {/* Specs before prose: they are what a rider scans for, and burying
                them in the paragraph makes them a re-read. */}
            <View style={styles.specs}>
              <Spec label="Seats" value={String(shown.seats)} />
              <View style={styles.specDivider} />
              <Spec label="Luggage" value={shown.luggage} />
              <View style={styles.specDivider} />
              <Spec
                label="Views"
                value={String(shown.angles.length)}
              />
            </View>

            <Text style={styles.detail}>{shown.detail}</Text>

            <Text style={styles.note}>
              Prices depend on your route and timing. You will pick a vehicle once your trip is
              entered.
            </Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },

  closeWrap: {
    position: 'absolute',
    // `bottom` is set inline from the sheet's measured height + CLOSE_GAP.
    right: SHEET_PAD,
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  closeGlyph: { fontSize: 20, color: colors.text, fontWeight: '600' },

  sheet: {
    maxHeight: MAX_SHEET_H,
    // Dark, matching the Vehicles screen it opens from — a white sheet would
    // flash against the dark grid behind it.
    backgroundColor: '#111111',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: SHEET_PAD,
    paddingTop: spacing.md,
    // Clears the home indicator / gesture bar on tall phones.
    paddingBottom: spacing.xxl,
  },

  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: spacing.lg,
  },

  scrollContent: { paddingBottom: spacing.sm },

  stage: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F6C31833',
    padding: spacing.md,
  },
  spotlight: {
    position: 'absolute',
    top: 130,
    left: -GALLERY_W * 0.12,
    right: -GALLERY_W * 0.12,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(255,193,7,0.10)',
  },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  name: { ...type.display, fontSize: 24, color: '#FFFFFF' },
  seatBadge: {
    backgroundColor: 'rgba(255,193,7,0.14)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  seatBadgeText: { ...type.caption, color: colors.primary, fontWeight: '700' },

  blurb: { ...type.body, color: 'rgba(255,255,255,0.7)', marginTop: spacing.xs },

  specs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  spec: { flex: 1, gap: 2 },
  specDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: spacing.md,
  },
  specLabel: { ...type.caption, fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  specValue: { ...type.label, color: '#FFFFFF' },

  detail: {
    ...type.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 21,
    marginTop: spacing.lg,
  },
  note: {
    ...type.caption,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 16,
    marginTop: spacing.md,
  },
});