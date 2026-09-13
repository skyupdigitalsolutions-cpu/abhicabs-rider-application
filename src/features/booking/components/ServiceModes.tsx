/**
 * src/features/booking/components/ServiceModes.tsx
 *
 * The three service bodies that swap inside the home sheet when the bottom tab
 * changes. Each is thin: it composes the same shared pieces (RouteStack,
 * DateTile, PrimaryCta) plus only its own unique control.
 *
 *   Ride    — one-way / round-trip toggle, pickup + drop, optional return date
 *   Rental  — pickup only, package / flexible-hours picker
 *   Airport — pickup + drop, flight number
 *
 * ---------------------------------------------------------------------------
 * THE SEGMENTED CONTROLS
 * ---------------------------------------------------------------------------
 * One-way/Round-trip and Packages/Flexible are the same kind of choice as the
 * bottom tab bar — pick one of a small closed set — so they are built from the
 * same part: GlassSegments. A sliding pill on a tinted track, not each option
 * toggling its own background.
 *
 * That consistency is the point. Three visually different segmented controls on
 * one screen make the rider re-learn the same interaction three times, and
 * teach them nothing they can carry from one to the next.
 *
 * ---------------------------------------------------------------------------
 * SVG ICONS
 * ---------------------------------------------------------------------------
 * Segment icons are imported as COMPONENTS (via react-native-svg-transformer)
 * and rendered through `renderIcon`, NOT through `iconSource`. React Native's
 * <Image> cannot decode an .svg — it silently draws nothing, which is why an
 * `iconSource: require('...one-way.svg')` slot came up blank. `renderIcon`
 * returns a real <Svg> component, and `fill={color}` lets the glyph track the
 * active/muted label colour — provided the artwork does not carry its own
 * hardcoded fills.
 *
 * This needs react-native-svg (a NATIVE module, so the dev client must be
 * rebuilt), react-native-svg-transformer wired into metro.config.js, and a
 * *.svg type declaration. Restart Metro with `-c` after changing the config or
 * the imports resolve to the old asset path and stay blank.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBookingDraft, MAX_STOPS } from '../../../store/bookingDraft';
import { useRentalPackages } from '../api';
import type { TripType, RentalPackage } from '../../../types/domain';
import {
  // One vocabulary for all three tabs: the same route stack, the same date
  // tiles, the same CTA. Rental and Airport used to reach for a second set
  // (WhereToBar / RouteCard / DateRow / SearchButton), which meant three tabs
  // of the same form looked like three different products.
  RouteStack, RoutePill, RouteConnector, SwapButton, RemoveStopButton,
  AddStopPill, DateTileRow, DateTile, PrimaryCta,
} from './BookingShared';
import { colors, radius, spacing, type } from '../../../theme';

// Imported as components, not as assets — see the SVG note at the top.
import OneWayIcon from '../../../../assets/icons/one-way.svg';
import RoundTripIcon from '../../../../assets/icons/round-trip.svg';

type Nav = { navigate: (screen: string, params?: object) => void };

/* --------------------------- Segmented control ----------------------------- */

/** Inset between the track's edge and the pill inside it. */
const SEG_PAD = 5;

/** Box the segment icon is drawn in, whichever form it takes. */
const ICON_SIZE = 18;

/**
 * Icons come in three forms, in priority order. All are optional — the Rental
 * picker uses none.
 *
 * Three rather than one because the app has no icon library installed and it
 * was not worth adding a native dependency to this control alone. Whichever
 * route the project eventually takes, the segment already accepts it:
 *
 *   renderIcon  — a function, for a vector library (@expo/vector-icons,
 *                 react-native-svg). Receives the live colour and size, so the
 *                 glyph tracks the selected state like the label does.
 *   iconSource  — a PNG/JPG from assets. Set `tintIcon` for a monochrome glyph
 *                 you want recoloured; leave it off for full-colour artwork.
 *   icon        — an emoji. The zero-setup fallback, and what ships today.
 *
 * HOW TO USE YOUR OWN ARTWORK
 *   1. Drop the files in  assets/icons/  (e.g. assets/icons/one-way.png)
 *   2. Pass them through:
 *        { key: 'ONE_WAY', label: 'One way',
 *          iconSource: require('../../../../assets/icons/one-way.png'),
 *          tintIcon: true }
 *   The path must be a literal — Metro resolves image requires at build time,
 *   so a variable or template path silently fails.
 *
 *   Around 48x48 or 72x72 suits the 18pt box. Transparent PNGs only.
 */
interface Segment<T extends string> {
  key: T;
  label: string;
  /** Emoji fallback. */
  icon?: string;
  /** Bitmap from assets. */
  iconSource?: ImageSourcePropType;
  /** Recolour a monochrome `iconSource` to match the label. */
  tintIcon?: boolean;
  /** Vector icon renderer — wins over the other two. */
  renderIcon?: (o: { active: boolean; color: string; size: number }) => ReactNode;
}

/**
 * A segmented control with ONE pill that slides between positions.
 *
 * Built the same way as every other glass surface in the app: a tinted base, a
 * specular sweep across the upper-left, and a lit top rim. Here the base is a
 * light tint rather than smoked black, because this control sits on a white
 * card — a translucent white pane on a white card shows nothing at all.
 */
function GlassSegments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Segment<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  /** Measured, because the pill's travel has to match the real layout. */
  const [trackW, setTrackW] = useState(0);
  const segW = trackW > 0 ? (trackW - SEG_PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.key === value));

  const pillX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pillX, {
      toValue: SEG_PAD + index * segW,
      useNativeDriver: true,
      // Low bounce: a control that wobbles reads as unserious.
      bounciness: 5,
      speed: 14,
    }).start();
  }, [index, segW, pillX]);

  return (
    <View style={styles.segTrack} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
      {/* specular sweep */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* lit top rim */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.3)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.segRim}
      />

      {/* The pill sits under the labels, so it passes behind them rather than
          each label carrying its own background. */}
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.segPill, { width: segW, transform: [{ translateX: pillX }] }]}
        />
      ) : null}

      {options.map((o) => (
        <SegmentButton
          key={o.key}
          option={o}
          active={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </View>
  );
}

/**
 * Shouts in development when an icon has been wired up in a way that cannot
 * render, instead of failing to nothing.
 *
 * The SVG case is the one worth catching: WITHOUT the transformer applied,
 * Metro lists `svg` in assetExts, so require('...svg') succeeds and returns a
 * perfectly valid asset — but React Native's <Image> has no SVG decoder, so it
 * draws an empty box. A silent blank is the worst possible feedback for a
 * wiring mistake.
 *
 * Detected from the resolved URI rather than an asset `type` field:
 * ImageResolvedAssetSource only carries uri/width/height/scale, so reading
 * `.type` is a type error. In dev the uri is a Metro URL with a query string
 * appended, so this looks for the extension anywhere in the string rather than
 * at the end.
 *
 * With the transformer wired up this is largely vestigial — svg has been moved
 * out of assetExts, so an .svg can no longer reach iconSource as an asset at
 * all. It stays as a guard against the transformer being removed later, and to
 * catch a require() handed to `icon`.
 */
function warnIfUnrenderable<T extends string>(option: Segment<T>) {
  if (option.iconSource && typeof option.iconSource === 'number') {
    const uri = Image.resolveAssetSource(option.iconSource)?.uri ?? '';
    if (uri.toLowerCase().includes('.svg')) {
      console.warn(
        `[GlassSegments] "${option.label}" points at an .svg via iconSource. ` +
          '<Image> cannot render SVG — use renderIcon with the SVG imported as ' +
          'a component, or export the icon as a PNG.',
      );
    }
  }
  if (option.icon !== undefined && typeof option.icon !== 'string') {
    console.warn(
      `[GlassSegments] "${option.label}" passed a non-string to \`icon\`. ` +
        'That prop is for emoji only — use iconSource for a require()d image.',
    );
  }
}

/**
 * One segment. The icon lifts and scales when selected — with a pill sliding
 * underneath, a static icon makes the pill look like it is passing over dead
 * furniture rather than picking something up.
 */
function SegmentButton<T extends string>({
  option,
  active,
  onPress,
}: {
  option: Segment<T>;
  active: boolean;
  onPress: () => void;
}) {
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: active ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [active, lift]);

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  // The icon tracks the label's colour, so selection reads as one change to the
  // whole segment rather than two unrelated ones.
  const tint = active ? colors.text : colors.textMuted;

  if (__DEV__) warnIfUnrenderable(option);

  const icon = option.renderIcon ? (
    option.renderIcon({ active, color: tint, size: ICON_SIZE })
  ) : option.iconSource ? (
    <Image
      source={option.iconSource}
      style={[styles.segIconImg, option.tintIcon ? { tintColor: tint } : null]}
      resizeMode="contain"
    />
  ) : // Guarded on the TYPE, not on truthiness. A require() handed to `icon` by
  // mistake is a module-id number, and <Text> will happily render it as a
  // stray digit — which is a genuinely confusing thing to debug.
  typeof option.icon === 'string' ? (
    <Text style={styles.segIcon}>{option.icon}</Text>
  ) : null;

  return (
    <Pressable
      style={styles.segBtn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {/* The scale lives on a wrapper, not on the glyph, so all three icon
          forms animate identically — a Text, an Image and a vector component
          cannot share one animated style otherwise. */}
      {icon ? (
        <Animated.View style={[styles.segIconWrap, { transform: [{ scale }] }]}>
          {icon}
        </Animated.View>
      ) : null}

      <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
        {option.label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------- Ride ------------------------------------ */

export function RideMode({ navigation }: { navigation: Nav }) {
  const {
    pickup, drop, stops, tripType, pickupAt, returnAt,
    setTripType, setPickupAt, setReturnAt, removeStop, swap,
  } = useBookingDraft();

  const isRound = tripType === 'ROUND_TRIP';
  const canContinue = Boolean(pickup && drop);

  /**
   * Trip end must never precede trip start. Rather than let the user pick an
   * impossible pair and fail at quote time, the end picker is floored at the
   * start — and if an existing end is now in the past relative to a newly
   * chosen start, it is pulled forward with it.
   */
  const onStartChange = (iso: string) => {
    setPickupAt(iso);
    if (isRound && returnAt && new Date(returnAt) < new Date(iso)) setReturnAt(iso);
  };

  return (
    <View style={styles.body}>
      <GlassSegments
        options={[
          // `fill={color}` only recolours the glyph if the .svg's paths do not
          // carry their own fill attributes. If an icon refuses to change
          // between active and muted, open the file and strip its fills, or
          // set them to currentColor.
          {
            key: 'ONE_WAY',
            label: 'One way',
            renderIcon: ({ color, size }) => (
              <OneWayIcon width={size} height={size} fill={color} />
            ),
          },
          {
            key: 'ROUND_TRIP',
            label: 'Round trip',
            renderIcon: ({ color, size }) => (
              <RoundTripIcon width={size} height={size} fill={color} />
            ),
          },
        ]}
        value={isRound ? 'ROUND_TRIP' : 'ONE_WAY'}
        onChange={(k) => setTripType(k as TripType)}
      />

      <RouteStack>
        <RoutePill
          kind="pickup"
          value={pickup?.label ?? null}
          placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
        />

        {stops.map((s, i) => (
          <View key={`stop-${i}`}>
            <RouteConnector />
            <RoutePill
              kind="stop"
              value={s.label}
              placeholder={`Stop ${i + 1}`}
              onPress={() => navigation.navigate('PlaceSearch', { field: 'stop', index: i })}
              trailing={<RemoveStopButton onPress={() => removeStop(i)} />}
            />
          </View>
        ))}

        <RouteConnector />
        <RoutePill
          kind="drop"
          value={drop?.label ?? null}
          placeholder="Where to?"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })}
          // Swapping is meaningless until both ends exist, and swapping with
          // stops in between would reverse the route without reversing them.
          trailing={<SwapButton onPress={swap} disabled={!pickup || !drop || stops.length > 0} />}
        />
      </RouteStack>

      <AddStopPill
        disabled={stops.length >= MAX_STOPS}
        onPress={() => navigation.navigate('PlaceSearch', { field: 'stop', index: stops.length })}
      />

      <DateTileRow>
        <DateTile
          label="Trip start"
          value={pickupAt}
          onChange={onStartChange}
          minimumDate={new Date()}
          full={!isRound}
        />
        {isRound ? (
          <DateTile
            label="Trip end"
            value={returnAt ?? pickupAt}
            onChange={setReturnAt}
            minimumDate={new Date(pickupAt)}
          />
        ) : null}
      </DateTileRow>

      <PrimaryCta label="Explore Cabs" disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />
    </View>
  );
}

/* -------------------------------- Rental ----------------------------------- */

export function RentalMode({ navigation }: { navigation: Nav }) {
  const {
    cityId, pickup, pickupAt, rentalPackageId, rentalHours,
    setTripType, setPickupAt, setRentalPackageId, setRentalHours,
  } = useBookingDraft();

  // Ensure the wire trip type is HOURLY while this tab is active.
  useEffect(() => {
    if (useBookingDraft.getState().tripType !== 'HOURLY') setTripType('HOURLY');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = Boolean(rentalPackageId || rentalHours);
  const canContinue = Boolean(pickup) && ready;

  return (
    <View style={styles.body}>
      <RouteStack>
        <RoutePill
          kind="pickup"
          value={pickup?.label ?? null}
          placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
        />
      </RouteStack>

      {/* One tile, full width. A local rental has no return leg, so the second
          slot the Ride tab uses would sit empty. */}
      <DateTileRow>
        <DateTile label="Trip start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} full />
      </DateTileRow>

      <LocalRentalPicker
        cityId={cityId}
        selectedPackageId={rentalPackageId}
        selectedHours={rentalHours}
        onPickPackage={setRentalPackageId}
        onPickHours={setRentalHours}
      />

      <PrimaryCta label="Explore Cabs" disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />
    </View>
  );
}

/* -------------------------------- Airport ---------------------------------- */

export function AirportMode({ navigation }: { navigation: Nav }) {
  const {
    pickup, drop, pickupAt, flightNumber,
    setTripType, setPickupAt, setFlightNumber, swap,
  } = useBookingDraft();

  const flightInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (useBookingDraft.getState().tripType !== 'AIRPORT') setTripType('AIRPORT');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = Boolean(pickup && drop);

  return (
    <View style={styles.body}>
      <RouteStack>
        <RoutePill
          kind="pickup"
          value={pickup?.label ?? null}
          placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
        />
        <RouteConnector />
        <RoutePill
          kind="drop"
          value={drop?.label ?? null}
          placeholder="Airport / destination"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })}
          // Airport runs go both ways — to the terminal and from it — so the
          // swap is as useful here as on a normal ride.
          trailing={<SwapButton onPress={swap} disabled={!pickup || !drop} />}
        />
      </RouteStack>

      <View style={styles.flightCard}>
        <Text style={styles.flightLabel}>Flight number (optional)</Text>
        {/*
          Keep the native TextInput OUT of the touch path so a vertical drag
          over it still moves the sheet (a raw TextInput swallows the gesture,
          which is why the Airport tab wasn't draggable from here). The plain
          Pressable behaves like every other element in the sheet — the sheet's
          move-capture can steal a drag from it — and a tap just focuses the
          field via the ref.
        */}
        <Pressable onPress={() => flightInputRef.current?.focus()}>
          <View pointerEvents="none">
            <TextInput
              ref={flightInputRef}
              style={styles.flightInput}
              placeholder="e.g. 6E 2345"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              value={flightNumber ?? ''}
              onChangeText={(t) => setFlightNumber(t || null)}
            />
          </View>
        </Pressable>
      </View>

      <DateTileRow>
        <DateTile label="Trip start" value={pickupAt} onChange={setPickupAt} minimumDate={new Date()} full />
      </DateTileRow>

      <PrimaryCta label="Explore Cabs" disabled={!canContinue} onPress={() => navigation.navigate('FareOptions')} />

    </View>
  );
}

/* ----------------------------- shared subviews ----------------------------- */

function LocalRentalPicker(props: {
  cityId: number;
  selectedPackageId: number | null;
  selectedHours: number | null;
  onPickPackage: (id: number | null) => void;
  onPickHours: (hours: number | null) => void;
}) {
  const { data, isLoading, isError } = useRentalPackages(props.cityId);
  const [mode, setMode] = useState<'package' | 'flexible'>(props.selectedHours ? 'flexible' : 'package');

  const distinctByLabel = useMemo(() => {
    const seen = new Map<string, RentalPackage>();
    for (const p of data ?? []) if (!seen.has(p.label)) seen.set(p.label, p);
    return [...seen.values()].sort((a, b) => a.includedHours - b.includedHours);
  }, [data]);

  return (
    <View style={styles.localCard}>
      {/* The same control as the trip-type toggle above it, so the rider is not
          asked to learn two different ways to pick one of two things. */}
      <GlassSegments
        options={[
          { key: 'package', label: 'Packages' },
          { key: 'flexible', label: 'Flexible hours' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'package' ? (
        isLoading ? (
          <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: spacing.lg }} />
        ) : isError || distinctByLabel.length === 0 ? (
          <Text style={styles.hint}>No packages available right now. Try flexible hours.</Text>
        ) : (
          <View style={styles.pkgGrid}>
            {distinctByLabel.map((p) => {
              const active = props.selectedPackageId != null && (data ?? []).some((x) => x.id === props.selectedPackageId && x.label === p.label);
              return (
                <PackageCard
                  key={p.label}
                  hours={p.includedHours}
                  km={p.includedKm}
                  active={active}
                  onPress={() => props.onPickPackage(active ? null : p.id)}
                />
              );
            })}
          </View>
        )
      ) : (
        <HoursStepper value={props.selectedHours ?? 4} onChange={(h) => props.onPickHours(h)} />
      )}
    </View>
  );
}

/**
 * One rental package, as a glass tile.
 *
 * Same recipe as every other glass surface in the app — tinted base, specular
 * sweep, lit rim — with the tint going amber when chosen. The selected state is
 * carried by the FILL rather than by swapping the text to white on solid amber:
 * these tiles are read as a set and compared against each other, and inverting
 * one of them makes the others momentarily unreadable by contrast.
 */
function PackageCard({
  hours,
  km,
  active,
  onPress,
}: {
  hours: number;
  km: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.pkgCard, active && styles.pkgCardActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${hours} hours, ${km} kilometres`}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.2)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.3)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.pkgRim}
      />

      <Text style={[styles.pkgHours, active && styles.pkgTextActive]}>{hours} hrs</Text>
      <Text style={styles.pkgKm}>{km} km</Text>
    </Pressable>
  );
}

function HoursStepper(props: { value: number; onChange: (h: number) => void }) {
  const dec = () => props.onChange(Math.max(1, props.value - 1));
  const inc = () => props.onChange(Math.min(24, props.value + 1));
  return (
    <View style={styles.stepperRow}>
      <Pressable style={styles.stepBtn} onPress={dec} hitSlop={8}><Text style={styles.stepGlyph}>–</Text></Pressable>
      <View style={styles.stepValueWrap}>
        <Text style={styles.stepValue}>{props.value}</Text>
        <Text style={styles.stepUnit}>hours</Text>
      </View>
      <Pressable style={styles.stepBtn} onPress={inc} hitSlop={8}><Text style={styles.stepGlyph}>+</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },

  /* ---- segmented control ---- */

  segTrack: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: SEG_PAD,
    overflow: 'hidden',
    // A tinted track, not a translucent one: this sits on a white card, and a
    // white-on-white pane shows nothing. The tint is what the pill moves over.
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segRim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  segPill: {
    position: 'absolute',
    top: SEG_PAD,
    bottom: SEG_PAD,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,193,7,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.55)',
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  segIconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segIcon: { fontSize: 15, lineHeight: 18 },
  segIconImg: { width: '100%', height: '100%' },
  segText: { ...type.label, fontSize: 13, color: colors.textMuted },
  segTextActive: { color: colors.text, fontWeight: '700' },

  /* ---- airport ---- */

  flightCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.xs },
  flightLabel: { ...type.caption, color: colors.textMuted },
  flightInput: {
    ...type.body, color: colors.text, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },

  /* ---- rental ---- */

  localCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  pkgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkgCard: {
    flexGrow: 1,
    minWidth: 90,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pkgCardActive: {
    // Amber tint rather than a solid amber fill — see PackageCard.
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(255,193,7,0.22)',
  },
  pkgRim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  pkgHours: { ...type.label, color: colors.text },
  pkgKm: { ...type.caption, color: colors.textMuted },
  pkgTextActive: { color: colors.text, fontWeight: '700' },
  hint: { ...type.caption, color: colors.textMuted },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  stepGlyph: { ...type.display, fontSize: 24, color: colors.text },
  stepValueWrap: { alignItems: 'center' },
  stepValue: { ...type.display, fontSize: 28, color: colors.text },
  stepUnit: { ...type.caption, color: colors.textMuted },
});