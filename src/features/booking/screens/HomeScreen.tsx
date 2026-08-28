/**
 * src/features/booking/screens/HomeScreen.tsx
 *
 * The launch pad for a ride. It shows the two things that start every booking —
 * "from where" and "to where" — plus saved addresses as one-tap shortcuts and a
 * trip-type toggle. Tapping a field opens the search screen; the chosen place
 * lands back in the booking draft, which this screen reads reactively.
 *
 * No map yet (that arrives with the fare/route slice). The pickup/drop fields
 * are the interaction; the map is decoration we add once selection works.
 *
 * Empty state, per the design guidance, is an invitation: when nothing is
 * chosen the field reads "Add pickup" / "Where to?" — a prompt to act, not a
 * blank.
 */

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '../../../store/session';
import { useBookingDraft } from '../../../store/bookingDraft';
import { useSavedAddresses } from '../api';
import type { HomeScreenProps } from '../../../navigation/types';
import type { SavedAddress, TripType } from '../../../types/domain';
import { colors, radius, spacing, type } from '../../../theme';

export function HomeScreen({ navigation }: HomeScreenProps) {
  const userName = useSession((s) => s.user?.name ?? 'there');
  const { pickup, drop, tripType, setTripType, setPickup, swap } = useBookingDraft();
  const addresses = useSavedAddresses();

  const canContinue = Boolean(pickup && drop);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.navigate('Trips')} hitSlop={8}>
          <Text style={styles.topBarLink}>Your trips</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={styles.topBarLink}>Account</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting}>Hi {userName.split(' ')[0]}</Text>
      <Text style={styles.prompt}>Where are you headed?</Text>

      <TripTypeToggle value={tripType} onChange={setTripType} />

      {/* Pickup / drop card */}
      <View style={styles.routeCard}>
        <PlaceField
          kind="pickup"
          label="Pickup"
          value={pickup?.label ?? null}
          placeholder="Add pickup point"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'pickup' })}
        />
        <View style={styles.divider} />
        <PlaceField
          kind="drop"
          label="Drop"
          value={drop?.label ?? null}
          placeholder="Where to?"
          onPress={() => navigation.navigate('PlaceSearch', { field: 'drop' })}
        />

        {pickup && drop ? (
          <Pressable style={styles.swapButton} onPress={swap} hitSlop={8}>
            <Text style={styles.swapText}>Swap</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Saved addresses as quick pickup shortcuts */}
      <SavedAddresses
        query={addresses}
        onPick={(a) =>
          setPickup({
            label: `${a.label} · ${a.line1}`,
            lat: a.lat ? Number(a.lat) : NaN,
            lng: a.lng ? Number(a.lng) : NaN,
            placeId: null,
          })
        }
      />

      <Pressable
        style={[styles.cta, !canContinue && styles.ctaDisabled]}
        disabled={!canContinue}
        onPress={() => navigation.navigate('FareOptions')}
      >
        <Text style={styles.ctaText}>See fares</Text>
      </Pressable>
    </ScrollView>
  );
}

/* -------------------------------- Subviews --------------------------------- */

function TripTypeToggle(props: { value: TripType; onChange: (t: TripType) => void }) {
  const options: { key: TripType; label: string }[] = [
    { key: 'ONE_WAY', label: 'One way' },
    { key: 'ROUND_TRIP', label: 'Round trip' },
  ];
  return (
    <View style={styles.toggle}>
      {options.map((o) => {
        const active = props.value === o.key;
        return (
          <Pressable
            key={o.key}
            style={[styles.toggleOption, active && styles.toggleOptionActive]}
            onPress={() => props.onChange(o.key)}
          >
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlaceField(props: {
  kind: 'pickup' | 'drop';
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.field} onPress={props.onPress}>
      <View style={[styles.dot, props.kind === 'pickup' ? styles.dotPickup : styles.dotDrop]} />
      <View style={styles.fieldTextWrap}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text
          style={[styles.fieldValue, !props.value && styles.fieldPlaceholder]}
          numberOfLines={1}
        >
          {props.value ?? props.placeholder}
        </Text>
      </View>
    </Pressable>
  );
}

function SavedAddresses(props: {
  query: ReturnType<typeof useSavedAddresses>;
  onPick: (a: SavedAddress) => void;
}) {
  const { data, isLoading, isError } = props.query;

  // Only addresses that have coordinates can seed a booking directly.
  const usable = useMemo(() => (data ?? []).filter((a) => a.lat && a.lng), [data]);

  if (isLoading) {
    return (
      <View style={styles.savedLoading}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (isError || usable.length === 0) return null; // silent: shortcuts are a bonus, not required

  return (
    <View style={styles.saved}>
      <Text style={styles.savedTitle}>Saved places</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRow}>
        {usable.map((a) => (
          <Pressable key={a.id} style={styles.savedChip} onPress={() => props.onPick(a)}>
            <Text style={styles.savedChipLabel}>{a.label}</Text>
            <Text style={styles.savedChipLine} numberOfLines={1}>
              {a.line1}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginBottom: spacing.xs },
  topBarLink: { ...type.label, color: colors.text },
  greeting: { ...type.body, color: colors.textMuted },
  prompt: { ...type.display, color: colors.text, marginBottom: spacing.sm },

  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: spacing.xs,
    alignSelf: 'flex-start',
  },
  toggleOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleText: { ...type.label, color: colors.textMuted },
  toggleTextActive: { color: colors.primaryText },

  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  field: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  dotPickup: { backgroundColor: colors.primary },
  dotDrop: { backgroundColor: colors.danger },
  fieldTextWrap: { flex: 1 },
  fieldLabel: { ...type.caption, color: colors.textMuted },
  fieldValue: { ...type.body, color: colors.text },
  fieldPlaceholder: { color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 22 },
  swapButton: { position: 'absolute', right: spacing.lg, top: spacing.lg },
  swapText: { ...type.label, color: colors.primary },

  saved: { gap: spacing.sm },
  savedLoading: { paddingVertical: spacing.md, alignItems: 'flex-start' },
  savedTitle: { ...type.label, color: colors.textMuted },
  savedRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  savedChip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    minWidth: 140,
  },
  savedChipLabel: { ...type.label, color: colors.text },
  savedChipLine: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  ctaDisabled: { backgroundColor: colors.surfaceAlt },
  ctaText: { ...type.label, color: colors.primaryText, fontSize: 16 },
});