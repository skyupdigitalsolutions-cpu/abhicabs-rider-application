/**
 * src/features/booking/components/VehicleGallery.tsx
 *
 * A swipeable gallery of one vehicle's angles, sized to sit inside a grid cell
 * on the Vehicles screen.
 *
 * ---------------------------------------------------------------------------
 * WHY A PAGED FlatList RATHER THAN A ROW OF THUMBNAILS
 * ---------------------------------------------------------------------------
 * In a two-column grid each cell is only about 160pt wide. That is barely
 * enough for ONE vehicle to read clearly, so a strip of thumbnails would show
 * four unrecognisable smudges. Paging gives every angle the full width of the
 * cell and snaps cleanly, so there is never a half-shot on screen.
 *
 * It degrades to a plain image when a vehicle has a single angle, so the screen
 * is correct with the artwork that exists today and gets better as more files
 * are added — no code change between those two states.
 */

import { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { VehicleAngle } from '../../../config/vehicles';
import { colors, radius, spacing, type } from '../../../theme';

interface Props {
  angles: VehicleAngle[];
  /** Shown when a vehicle has no artwork at all. */
  glyph: string;
  /** Width of one page. Passed in so the parent owns the grid maths. */
  width: number;
  /** Height of the image stage. Grid cells are short; detail views are taller. */
  height?: number;
}

export function VehicleGallery({ angles, glyph, width, height = 104 }: Props) {
  const listRef = useRef<FlatList<VehicleAngle>>(null);
  const [index, setIndex] = useState(0);

  /* --- nothing to show -------------------------------------------------- */

  if (angles.length === 0) {
    return (
      <View style={[styles.stage, { width, height }]}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
    );
  }

  /* --- a single angle: no pager chrome ---------------------------------- */

  // Bound to a local rather than read as angles[0] twice: with
  // noUncheckedIndexedAccess an index read is `VehicleAngle | undefined`, and a
  // length check does not narrow it. The explicit guard does, and it costs
  // nothing at runtime.
  const only = angles.length === 1 ? angles[0] : undefined;
  if (only) {
    return (
      <View style={[styles.stage, { width, height }]}>
        <Image source={only.source} style={styles.image} resizeMode="contain" />
      </View>
    );
  }

  /* --- the pager -------------------------------------------------------- */

  /**
   * Derive the page from the scroll offset rather than onViewableItemsChanged.
   * The viewability callback needs a config object that must never change
   * identity, and it fires on a threshold rather than at rest — rounding the
   * offset is both simpler and exactly right for a paged list.
   */
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex((prev) => (prev === next ? prev : next));
  };

  const goTo = (i: number) => {
    setIndex(i);
    listRef.current?.scrollToOffset({ offset: i * width, animated: true });
  };

  return (
    <View>
      <View style={{ height }}>
        <FlatList
          ref={listRef}
          data={angles}
          keyExtractor={(a, i) => `${a.label}-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          // Fixed page width lets the list skip measuring every row, which
          // keeps scrollToOffset exact and the first paint cheap.
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <View style={[styles.stage, { width, height }]}>
              <Image source={item.source} style={styles.image} resizeMode="contain" />
            </View>
          )}
        />

        {/* The angle name floats ON the image rather than below it. In a grid
            cell every vertical point is contended, and the label is glanceable
            context, not something to reserve a whole row for. */}
        <View style={styles.angleChip} pointerEvents="none">
          <Text style={styles.angleChipText} numberOfLines={1}>
            {angles[index]?.label}
          </Text>
        </View>
      </View>

      {/* Tappable dots. Swiping is the primary gesture, but in a narrow cell a
          slow drag is easily swallowed, so the dots are a real fallback. */}
      <View style={styles.dots}>
        {angles.map((a, i) => (
          <Pressable
            key={`${a.label}-${i}`}
            onPress={() => goTo(i)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Show ${a.label}`}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Fixed-size stage so every angle occupies the same box. Without it the row
   * jumps as portrait interior shots follow landscape exteriors.
   */
  stage: { alignItems: 'center', justifyContent: 'center' },
  image: { width: '86%', height: '86%' },
  glyph: { fontSize: 40 },

  angleChip: {
    position: 'absolute',
    left: 0,
    // Top rather than bottom: the detail sheet draws a lit ring under the
    // vehicle, and a chip sitting in it looked like debris on the turntable.
    top: 0,
    maxWidth: '80%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  angleChipText: {
    ...type.caption,
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },

  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: colors.primary,
    // Wider when active — a size change reads faster than colour alone on a
    // dark background.
    width: 14,
  },
});