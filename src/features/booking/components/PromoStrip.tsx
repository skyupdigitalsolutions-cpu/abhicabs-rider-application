/**
 * src/features/booking/components/PromoStrip.tsx
 *
 * The amber strip that sits above the booking sheet, cycling between the brand
 * mark and whatever offers are currently running.
 *
 * ---------------------------------------------------------------------------
 * WHY IT ROTATES RATHER THAN STACKING
 * ---------------------------------------------------------------------------
 * The strip is the only piece of chrome between the map and the sheet, so every
 * pixel it takes is a pixel of map the rider loses. Showing the brand and the
 * offers in one rotating slot keeps it to a single line. Stacking them, or
 * widening the strip to fit both, would eat the map for something the rider did
 * not ask for.
 *
 * A single message does not animate at all — rotation only earns its keep when
 * there is genuinely more than one thing to say.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../../theme';

/**
 * `brand` renders the wordmark; `offer` renders a promotional line with a bolt.
 * They are separate kinds rather than one string because they are different
 * things — one is identity, the other is marketing copy that will eventually
 * come from the backend and can be empty.
 */
export type PromoMessage =
  | { kind: 'brand'; label: string }
  | { kind: 'offer'; label: string };

interface Props {
  messages: PromoMessage[];
  /** How long each message is held, in ms. */
  intervalMs?: number;
}

const FADE_MS = 260;

export function PromoStrip({ messages, intervalMs = 3200 }: Props) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  // Riders who have asked their OS to reduce motion get the messages swapped
  // without a cross-fade. The information is identical; only the transition
  // goes away.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (messages.length < 2) return;

    const timer = setInterval(() => {
      if (reduceMotion) {
        setIndex((i) => (i + 1) % messages.length);
        return;
      }
      // Fade out, swap the text while it is invisible, fade back in. Swapping
      // mid-fade rather than on completion keeps the strip from flashing empty.
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
        () => {
          setIndex((i) => (i + 1) % messages.length);
          Animated.timing(opacity, {
            toValue: 1,
            duration: FADE_MS,
            useNativeDriver: true,
          }).start();
        },
      );
    }, intervalMs);

    return () => clearInterval(timer);
  }, [messages.length, intervalMs, reduceMotion, opacity]);

  // Guard against a shrinking list leaving the index out of range.
  const current = messages[Math.min(index, messages.length - 1)];
  if (!current) return null;

  return (
    <View style={styles.row}>
      <Animated.View style={reduceMotion ? undefined : { opacity }}>
        {current.kind === 'brand' ? (
          <Text style={styles.brand} numberOfLines={1}>
            {current.label}
          </Text>
        ) : (
          <Text style={styles.offer} numberOfLines={1}>
            ⚡ {current.label}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  brand: {
    ...type.title,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.primaryText,
  },
  offer: {
    ...type.label,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryText,
  },
});