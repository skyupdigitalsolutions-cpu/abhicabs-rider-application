/**
 * src/features/auth/screens/OnboardingScreen.tsx
 *
 * A three-slide intro carousel shown only on the very first app launch. Swipe or
 * tap the arrow to advance; "Skip" (or finishing the last slide) marks
 * onboarding as seen and hands off to the sign-in choice, so it never shows
 * again on this device.
 *
 * The illustrations are simple emoji/shape placeholders using the app theme —
 * drop real illustration assets in later by swapping the <Art> block.
 */

import { useRef, useState } from 'react';
import {
  Dimensions, FlatList, Pressable, StyleSheet, Text, View,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { appStorage } from '../../../lib/storage';
import type { OnboardingScreenProps } from '../../../navigation/types';
import { colors, radius, spacing, type } from '../../../theme';

const { width } = Dimensions.get('window');

export const ONBOARDING_SEEN_KEY = 'onboarding_seen_v1';

interface Slide {
  key: string;
  art: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    key: 'anywhere',
    art: '🧳🚕',
    title: 'Anywhere you are',
    body: 'Book a ride from wherever you are, whenever you need one — across the city in seconds.',
  },
  {
    key: 'anytime',
    art: '📍🚗',
    title: 'At anytime',
    body: 'Day or night, schedule ahead or ride now. A driver is always close by.',
  },
  {
    key: 'book',
    art: '📱🚙',
    title: 'Book your car',
    body: 'Pick your spot, choose your ride, and track the car all the way to you.',
  },
];

export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    try { await appStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* non-fatal */ }
    navigation.replace('Welcome');
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      const i = index + 1;
      listRef.current?.scrollToIndex({ index: i, animated: true });
      setIndex(i);
    } else {
      finish();
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      {/* Skip */}
      <View style={styles.top}>
        {!isLast ? (
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : <View />}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.art}>
              <Text style={styles.artGlyph}>{item.art}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {/* Next / Go */}
      <View style={styles.bottom}>
        <Pressable style={styles.fab} onPress={next}>
          <Text style={styles.fabText}>{isLast ? 'Go' : '→'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 56, paddingHorizontal: spacing.xl, justifyContent: 'center', alignItems: 'flex-end' },
  skip: { ...type.label, color: colors.primary, fontSize: 16 },

  slide: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  art: {
    width: '100%', height: 240, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxl,
    borderWidth: 1, borderColor: colors.border,
  },
  artGlyph: { fontSize: 96 },
  title: { ...type.display, fontSize: 26, color: colors.text, marginBottom: spacing.md },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 22 },

  bottom: { alignItems: 'center', paddingBottom: spacing.xxl },
  fab: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  fabText: { ...type.display, fontSize: 22, color: colors.primaryText, fontWeight: '800' },
});