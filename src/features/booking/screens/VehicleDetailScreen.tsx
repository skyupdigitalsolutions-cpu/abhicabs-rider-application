/**
 * src/features/booking/screens/VehicleDetailScreen.tsx
 *
 * The full-page detail view for one vehicle class, reached by tapping a card on
 * the Vehicles screen. Hero with a thumbnail strip, then About / Gallery /
 * Review tabs, with a price and book bar pinned to the bottom.
 *
 * ---------------------------------------------------------------------------
 * A PAGE, NOT THE SHEET
 * ---------------------------------------------------------------------------
 * The sheet was right when the content was a glance. Tabs are not a glance —
 * they are somewhere the rider moves around in, and a draggable container that
 * can be flicked away mid-read fights that. A route also gives back/gesture
 * handling and a shareable destination for free.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * Prices come from GET /fares/rental-packages — the cheapest active package for
 * this class in the current city. Where nothing is seeded, no price is shown.
 *
 * Reviews have NO backend behind them. The schema carries ratingAvg and
 * ratingCount on DRIVER only, there is no review text anywhere, and no
 * rider-facing endpoint exposes either. The tab therefore says so plainly
 * instead of rendering invented testimonials, which would be the kind of thing
 * that quietly ships to production and misleads real customers.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SvgProps } from 'react-native-svg';
import { VEHICLES } from '../../../config/vehicles';
import { useClassFromPrices } from '../components/VehicleCategoryRow';
import type { VehicleDetailScreenProps } from '../../../navigation/types';
import { colors, layout, radius, spacing, type } from '../../../theme';

/**
 * Spec and info icons, imported as COMPONENTS via react-native-svg-transformer.
 * Not <Image source={require(...)}>: React Native cannot decode an .svg that
 * way and silently draws an empty box.
 *
 * seat / bag / car are the same three the Vehicles list uses — one glyph per
 * concept across the app, so a seat always looks like a seat.
 */
import SeatIcon from '../../../../assets/icons/seat.svg';
import BagIcon from '../../../../assets/icons/bag.svg';
import CarIcon from '../../../../assets/icons/car.svg';
import CameraIcon from '../../../../assets/icons/camera.svg';
import PriceIcon from '../../../../assets/icons/price.svg';
import DriverIcon from '../../../../assets/icons/driver.svg';
import ShieldIcon from '../../../../assets/icons/shield.svg';

const { width: SCREEN_W } = Dimensions.get('window');

const EDGE = spacing.lg;
/** Height of the pinned book bar, reserved as scroll clearance. */
const BAR_H = 104;
/** How many thumbnails fit before the rest collapse into a "+N" tile. */
const THUMB_LIMIT = 4;
/** Inset between the tab track's edge and the pills inside it. */
const TRACK_PAD = 4;

/** Glyph size inside the spec and info discs. */
const DISC_ICON = 16;

type Tab = 'ABOUT' | 'GALLERY' | 'REVIEW';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ABOUT', label: 'About' },
  { key: 'GALLERY', label: 'Gallery' },
  { key: 'REVIEW', label: 'Review' },
];

export function VehicleDetailScreen({ route, navigation }: VehicleDetailScreenProps) {
  const vehicle = VEHICLES.find((v) => v.key === route.params.vehicleKey);

  const [tab, setTab] = useState<Tab>('ABOUT');
  const [angle, setAngle] = useState(0);

  const { data: prices } = useClassFromPrices();

  /* ---- tab animation ------------------------------------------------- */

  /** Track width, measured — the pill's travel has to match the real layout. */
  const [trackW, setTrackW] = useState(0);
  const pillW = trackW > 0 ? (trackW - TRACK_PAD * 2) / TABS.length : 0;

  /**
   * The sliding pill. Animating a single pill between positions rather than
   * swapping a background colour on three views is what makes the control feel
   * like one moving object instead of three lamps switching on and off.
   */
  const pillX = useRef(new Animated.Value(0)).current;

  /** Drives the fade-and-rise of whichever tab body is on screen. */
  const bodyIn = useRef(new Animated.Value(1)).current;

  const index = TABS.findIndex((t) => t.key === tab);

  useEffect(() => {
    Animated.spring(pillX, {
      toValue: TRACK_PAD + index * pillW,
      useNativeDriver: true,
      // Low bounce: a segmented control that overshoots reads as unserious.
      bounciness: 4,
      speed: 16,
    }).start();
  }, [index, pillW, pillX]);

  useEffect(() => {
    // Restart from slightly faded and low, then settle. Cross-fading the two
    // bodies would need both mounted at once; this reads the same and keeps
    // only the active tab in the tree.
    bodyIn.setValue(0);
    Animated.timing(bodyIn, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [tab, bodyIn]);

  const bodyStyle = {
    opacity: bodyIn,
    transform: [
      {
        translateY: bodyIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      },
    ],
  };

  // Defensive: a stale deep link or a removed vehicle should not crash.
  if (!vehicle) {
    return (
      <View style={[styles.root, styles.centre]}>
        <Text style={styles.empty}>That vehicle is no longer available.</Text>
      </View>
    );
  }

  const price = prices?.[vehicle.key];
  const angles = vehicle.angles;
  const hero = angles[angle]?.source ?? vehicle.image;
  const extra = angles.length - THUMB_LIMIT;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ---- hero ---------------------------------------------------- */}
        <View style={styles.heroWrap}>
          <View style={styles.heroGlow} pointerEvents="none" />
          {hero ? (
            <Image source={hero} style={styles.hero} resizeMode="contain" />
          ) : (
            <Text style={styles.heroGlyph}>{vehicle.glyph}</Text>
          )}
        </View>

        {/* Thumbnail strip. Only earns its space with more than one angle. */}
        {angles.length > 1 ? (
          <View style={styles.thumbs}>
            {angles.slice(0, THUMB_LIMIT).map((a, i) => (
              <Pressable
                key={`${a.label}-${i}`}
                onPress={() => setAngle(i)}
                style={[styles.thumb, i === angle && styles.thumbActive]}
                accessibilityRole="button"
                accessibilityLabel={`Show ${a.label}`}
              >
                <Image source={a.source} style={styles.thumbImg} resizeMode="contain" />
              </Pressable>
            ))}

            {/* The overflow tile jumps to the Gallery tab rather than paging on
                in place — once there are this many shots, a grid is the better
                way to look at them. */}
            {extra > 0 ? (
              <Pressable
                style={[styles.thumb, styles.thumbMore]}
                onPress={() => setTab('GALLERY')}
                accessibilityRole="button"
                accessibilityLabel={`See all ${angles.length} photos`}
              >
                <Text style={styles.thumbMoreText}>+{extra}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ---- title --------------------------------------------------- */}
        <View style={styles.classChip}>
          <Text style={styles.classChipText}>{vehicle.name.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{vehicle.name}</Text>
        <Text style={styles.blurb}>{vehicle.blurb}</Text>

        {/* ---- tabs -------------------------------------------------------
            A segmented control with ONE pill that slides between positions.
            The labels sit above it, so the moving surface passes underneath
            them rather than each label carrying its own background. */}
        <View style={styles.tabs} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          {pillW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.pill, { width: pillW, transform: [{ translateX: pillX }] }]}
            />
          ) : null}

          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Animated.View style={bodyStyle}>
          {tab === 'ABOUT' ? <AboutTab vehicle={vehicle} /> : null}
          {tab === 'GALLERY' ? <GalleryTab vehicle={vehicle} onPick={setAngle} /> : null}
          {tab === 'REVIEW' ? <ReviewTab vehicleKey={vehicle.key} /> : null}
        </Animated.View>
      </ScrollView>

      {/* ---- book bar --------------------------------------------------- */}
      <View style={styles.bar}>
        <View style={styles.barPrice}>
          <Text style={styles.barPriceLabel}>{price !== undefined ? 'From' : 'Fare'}</Text>
          {price !== undefined ? (
            <Text style={styles.barPriceValue}>
              ₹{Math.round(price).toLocaleString('en-IN')}
            </Text>
          ) : (
            // No seeded package for this class, so there is no honest number to
            // show. The fare is still real — it just needs a route first.
            <Text style={styles.barPriceNone}>Route based</Text>
          )}
        </View>

        <BookButton
          label="Book Now"
          accessibilityLabel={`Book a ride with ${vehicle.name}`}
          onPress={() => navigation.navigate('BookVehicle', { vehicleKey: vehicle.key })}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Book button
 * ------------------------------------------------------------------ */

/** Diameter of the ripple at full expansion — wide enough to cover the button. */
const RIPPLE = 260;

/**
 * Amber glass with a ripple that grows from wherever the finger landed.
 *
 * The glass here is built the same way as the dark panels elsewhere — a tinted
 * base, a specular sweep and a lit top rim — but keyed to amber rather than
 * black. A flat fill would have been simpler; the sweep is what stops a large
 * saturated rectangle looking like a placeholder.
 *
 * The ripple starts at the TOUCH POINT rather than the centre. A centred bubble
 * plays the same animation no matter where you press, which is exactly the tell
 * that makes it feel canned instead of responsive.
 */
function BookButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  const onPressIn = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setOrigin({ x: locationX, y: locationY });

    scale.setValue(0);
    fade.setValue(0.5);

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 480,
        // Decelerating: the bubble should spread fast then ease, the way a drop
        // does. Linear looks mechanical.
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // A slight squash under the finger, released on lift.
      Animated.timing(press, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      // Only clear once the whole run completes; clearing on an interrupted
      // animation would blank a ripple that is still mid-flight.
      if (finished) setOrigin(null);
    });
  };

  const onPressOut = () => {
    Animated.timing(press, { toValue: 0, duration: 160, useNativeDriver: true }).start();
  };

  const pressScale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });

  return (
    <Animated.View style={[styles.bookWrap, { transform: [{ scale: pressScale }] }]}>
      <Pressable
        style={styles.bookPress}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {/* 1 — amber base, slightly translucent so it reads as a material */}
        <View style={styles.bookBase} pointerEvents="none" />

        {/* 2 — specular sweep across the upper-left */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.10)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* 3 — lit top rim */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.15)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bookRim}
        />

        {/* 4 — the ripple, anchored to the touch point */}
        {origin ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                left: origin.x - RIPPLE / 2,
                top: origin.y - RIPPLE / 2,
                opacity: fade,
                transform: [{ scale }],
              },
            ]}
          />
        ) : null}

        <Text style={styles.bookText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Tab bodies
 * ------------------------------------------------------------------ */

function AboutTab({ vehicle }: { vehicle: (typeof VEHICLES)[number] }) {
  return (
    <View style={styles.tabBody}>
      <SectionHeader title="About" />

      {/* The description gets a card with an amber spine rather than sitting as
          loose text. On a page made of cards, one unframed paragraph reads as
          something the designer forgot rather than something deliberate. */}
      <View style={styles.quote}>
        <View style={styles.quoteSpine} />
        <Text style={styles.quoteText}>{vehicle.detail}</Text>
      </View>

      <SectionHeader title="Specifications" />
      <View style={styles.specGrid}>
        <Spec Icon={SeatIcon} label="Capacity" value={`${vehicle.seats}`} unit="seats" />
        <Spec Icon={BagIcon} label="Luggage" value={vehicle.luggage} />
        <Spec Icon={CameraIcon} label="Photos" value={`${vehicle.angles.length}`} unit="views" />
        <Spec Icon={CarIcon} label="Class" value={vehicle.name} />
      </View>

      <SectionHeader title="Good to know" />

      {/* Rows rather than bullets. Each of these is a distinct promise about how
          a booking behaves, and a dot in front of a sentence gives the rider no
          way to scan for the one they care about — the bold lead line does. */}
      <View style={styles.infoList}>
        <InfoRow
          Icon={PriceIcon}
          title="Route-based pricing"
          text="Your final fare depends on the route, timing and trip type you choose."
        />
        <InfoRow
          Icon={DriverIcon}
          title="Driver assigned after confirmation"
          text="We match you with a driver and vehicle once the booking is confirmed."
        />
        <InfoRow
          Icon={ShieldIcon}
          title="Free cancellation"
          text="Cancel at no charge up to 30 minutes before your pickup time."
        />
      </View>
    </View>
  );
}

/** A heading with an amber spine, so sections read as titled blocks. */
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function InfoRow({
  Icon,
  title,
  text,
}: {
  Icon: React.FC<SvgProps>;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.infoRow}>
      {/* Filled with the body text colour: the disc is a neutral grey, so the
          glyph has to carry its own contrast rather than relying on the tint
          behind it the way the amber spec discs do. */}
      <View style={styles.infoDisc}>
        <Icon width={DISC_ICON} height={DISC_ICON} fill={colors.text} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{text}</Text>
      </View>
    </View>
  );
}

function GalleryTab({
  vehicle,
  onPick,
}: {
  vehicle: (typeof VEHICLES)[number];
  onPick: (i: number) => void;
}) {
  const angles = vehicle.angles;
  /** Collapsed by default so the tab opens at a readable length. */
  const [showAll, setShowAll] = useState(false);
  const GALLERY_PREVIEW = 4;

  const visible = showAll ? angles : angles.slice(0, GALLERY_PREVIEW);
  const hasMore = angles.length > GALLERY_PREVIEW;

  return (
    <View style={styles.tabBody}>
      <View style={styles.listHead}>
        <View style={styles.listHeadLeft}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Gallery</Text>
          <Text style={styles.count}>({angles.length})</Text>
        </View>

        {/* Only offered when it would actually reveal something. */}
        {hasMore ? (
          <Pressable onPress={() => setShowAll((s) => !s)} hitSlop={8}>
            <Text style={styles.viewAll}>{showAll ? 'Show less' : 'View All'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.grid}>
        {visible.map((a, i) => (
          <Pressable
            key={`${a.label}-${i}`}
            style={styles.gridCell}
            onPress={() => onPick(i)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${a.label} at full size`}
          >
            <Image source={a.source} style={styles.gridImg} resizeMode="contain" />
            <View style={styles.gridTag}>
              <Text style={styles.gridTagText} numberOfLines={1}>
                {a.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {angles.length <= 1 ? (
        <Text style={styles.note}>More angles of this vehicle are on the way.</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

interface VehicleReview {
  id: string;
  author: string;
  rating: number;
  /** Already formatted for display; the source decides the locale. */
  date: string;
  text: string;
}

/**
 * Reviews for a vehicle class.
 *
 * There is NO backend for this yet. The schema carries ratingAvg and
 * ratingCount on DRIVER only, there is no review text anywhere, and nothing
 * rider-facing exposes either — so this returns empty and the tab renders its
 * empty state.
 *
 * It is written as a hook returning the real shape rather than inlined as a
 * placeholder array so that wiring it up later is a one-function change:
 * swap the body for the request and every component below already fits.
 */
function useVehicleReviews(_vehicleKey: string): {
  reviews: VehicleReview[];
  average: number | null;
  tripCount: number;
} {
  return { reviews: [], average: null, tripCount: 0 };
}

function ReviewTab({ vehicleKey }: { vehicleKey: string }) {
  const { reviews, average, tripCount } = useVehicleReviews(vehicleKey);

  if (reviews.length === 0) {
    return (
      <View style={styles.tabBody}>
        <SectionHeader title="Ratings & Reviews" />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyStars}>☆☆☆☆☆</Text>
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyBody}>
            Ratings are collected after each trip. Once riders have travelled in this class, their
            feedback will appear here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabBody}>
      <SectionHeader title="Ratings & Reviews" />

      {/* Summary: the score carries the weight, the stars confirm it at a
          glance, and the trip count is what makes either believable. */}
      <View style={styles.ratingCard}>
        <Text style={styles.ratingScore}>{average?.toFixed(1)}</Text>
        <View style={styles.ratingRight}>
          <Stars value={average ?? 0} />
          <Text style={styles.ratingMeta}>
            Based on {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
          </Text>
        </View>
      </View>

      <View style={styles.listHead}>
        <View style={styles.listHeadLeft}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <Text style={styles.count}>({reviews.length})</Text>
        </View>
      </View>

      {/* Horizontal: reviews are browsed, not read end to end, and a vertical
          list of them would bury the book bar under opinions. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.reviewRow}
      >
        {reviews.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </ScrollView>
    </View>
  );
}

function ReviewCard({ review }: { review: VehicleReview }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHead}>
        {/* Initial rather than a photo: there is no avatar in the schema, and a
            generic silhouette for every reviewer looks worse than a letter. */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{review.author.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.reviewWho}>
          <Text style={styles.reviewName} numberOfLines={1}>
            {review.author}
          </Text>
          <Text style={styles.reviewDate}>{review.date}</Text>
        </View>

        <View style={styles.reviewScore}>
          <Text style={styles.reviewScoreText}>{review.rating.toFixed(1)} ★</Text>
        </View>
      </View>

      <Text style={styles.reviewText} numberOfLines={4}>
        {review.text}
      </Text>
    </View>
  );
}

/** Five glyphs, filled to the nearest half. */
function Stars({ value }: { value: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={[styles.star, value >= i - 0.5 && styles.starOn]}>
          ★
        </Text>
      ))}
    </View>
  );
}

function Spec({
  Icon,
  label,
  value,
  unit,
}: {
  Icon: React.FC<SvgProps>;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={styles.spec}>
      {/* The glyph sits in a tinted disc, filled the same dark amber used by
          every other accent on this screen so the disc and its contents read as
          one object rather than a shape with something dropped into it. */}
      <View style={styles.specDisc}>
        <Icon width={DISC_ICON} height={DISC_ICON} fill="#8A6D0B" />
      </View>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
        {unit ? <Text style={styles.specUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centre: { alignItems: 'center', justifyContent: 'center' },
  empty: { ...type.body, color: colors.textMuted },

  content: {
    paddingHorizontal: EDGE,
    // The header is transparent, so content starts below the back arrow.
    paddingTop: layout.headerOffset + layout.screenPaddingY,
    paddingBottom: BAR_H + layout.screenPaddingY,
  },

  heroWrap: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    bottom: 12,
    width: '84%',
    height: 70,
    borderRadius: 999,
    backgroundColor: 'rgba(255,193,7,0.18)',
  },
  hero: { width: '90%', height: '86%' },
  heroGlyph: { fontSize: 72 },

  thumbs: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  thumb: {
    flex: 1,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbActive: { borderColor: colors.primary },
  thumbImg: { width: '86%', height: '86%' },
  thumbMore: { backgroundColor: colors.text },
  thumbMoreText: { ...type.label, fontSize: 14, color: '#FFFFFF' },

  classChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,193,7,0.18)',
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.lg,
  },
  classChipText: { ...type.caption, fontSize: 10, fontWeight: '700', color: '#8A6D0B' },

  name: { ...type.title, fontSize: 22, color: colors.text, marginTop: spacing.sm },
  blurb: { ...type.body, fontSize: 14, color: colors.textMuted, marginTop: 2 },

  tabs: {
    flexDirection: 'row',
    // A tinted track behind the pill. Without it the inactive tabs float on
    // white and the group stops reading as one control.
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: TRACK_PAD,
    marginTop: spacing.lg,
  },
  pill: {
    position: 'absolute',
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    left: 0,
    borderRadius: radius.pill,
    // White pill lifted off the track — the shadow is what makes it read as a
    // raised switch rather than a flat colour swap.
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  tabText: { ...type.label, fontSize: 13, color: colors.textMuted },
  tabTextActive: { color: colors.text },

  tabBody: { paddingTop: spacing.md },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: colors.primary },
  sectionTitle: { ...type.label, fontSize: 16, color: colors.text },

  quote: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  quoteSpine: { width: 3, borderRadius: 2, backgroundColor: 'rgba(255,193,7,0.5)' },
  quoteText: { ...type.body, fontSize: 14, color: colors.textMuted, lineHeight: 21, flex: 1 },

  specGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  spec: {
    // Two per row, accounting for the gap between them.
    width: (SCREEN_W - EDGE * 2 - spacing.sm) / 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
    // A whisper of elevation. Flat grey tiles read as disabled inputs; a lifted
    // white card reads as information.
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  specDisc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,193,7,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  specLabel: {
    ...type.caption,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  specValue: { ...type.title, fontSize: 17, color: colors.text },
  specUnit: { ...type.caption, fontSize: 11, color: colors.textMuted, fontWeight: '400' },

  infoList: { gap: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  infoDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { flex: 1 },
  infoTitle: { ...type.label, fontSize: 14, color: colors.text },
  infoBody: {
    ...type.caption,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },

  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  listHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { ...type.label, fontSize: 14, color: colors.textMuted },
  viewAll: { ...type.label, fontSize: 13, color: '#8A6D0B' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: {
    width: (SCREEN_W - EDGE * 2 - spacing.sm) / 2,
    height: 132,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    overflow: 'hidden',
  },
  gridImg: { width: '92%', height: '82%' },
  gridTag: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    maxWidth: '80%',
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  gridTagText: { ...type.caption, fontSize: 9, color: '#FFFFFF', fontWeight: '600' },

  note: { ...type.caption, color: colors.textMuted, marginTop: spacing.md },

  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  ratingScore: { ...type.display, fontSize: 40, color: colors.text, lineHeight: 44 },
  ratingRight: { flex: 1, gap: 2 },
  ratingMeta: { ...type.caption, fontSize: 12, color: colors.textMuted },

  stars: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 15, color: colors.border },
  starOn: { color: colors.primary },

  reviewRow: { gap: spacing.sm, paddingRight: EDGE },
  reviewCard: {
    width: SCREEN_W * 0.74,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,193,7,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.label, fontSize: 15, color: '#8A6D0B' },
  reviewWho: { flex: 1 },
  reviewName: { ...type.label, fontSize: 14, color: colors.text },
  reviewDate: { ...type.caption, fontSize: 10, color: colors.textMuted },
  reviewScore: {
    backgroundColor: 'rgba(255,193,7,0.18)',
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  reviewScoreText: { ...type.caption, fontSize: 11, fontWeight: '700', color: '#8A6D0B' },
  reviewText: { ...type.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  emptyCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyStars: { fontSize: 24, color: colors.border, letterSpacing: 3, marginBottom: spacing.sm },
  emptyTitle: { ...type.label, fontSize: 15, color: colors.text },
  emptyBody: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: spacing.xs,
  },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: EDGE,
    paddingTop: spacing.md,
    // Clears the home indicator / gesture bar on tall phones.
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barPrice: { minWidth: 76 },
  barPriceLabel: { ...type.caption, fontSize: 10, color: colors.textMuted },
  barPriceValue: { ...type.title, fontSize: 20, color: colors.text },
  barPriceNone: { ...type.label, fontSize: 14, color: colors.text },

  bookWrap: {
    flex: 1,
    borderRadius: radius.pill,
    // Amber glow beneath, so the glass looks lit rather than pasted on.
    shadowColor: '#F0A500',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bookPress: {
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the ripple to the pill — without this the bubble spills out as a
    // square and the illusion collapses.
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  bookBase: {
    ...StyleSheet.absoluteFillObject,
    // Translucent rather than flat amber: the slight transparency is what makes
    // it read as glass and not as a solid swatch.
    backgroundColor: 'rgba(255,193,7,0.92)',
  },
  bookRim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  ripple: {
    position: 'absolute',
    width: RIPPLE,
    height: RIPPLE,
    borderRadius: RIPPLE / 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  bookText: {
    ...type.label,
    fontSize: 16,
    color: colors.primaryText,
    fontWeight: '700',
    // Above the base, sweep, rim and ripple.
    zIndex: 2,
  },
});