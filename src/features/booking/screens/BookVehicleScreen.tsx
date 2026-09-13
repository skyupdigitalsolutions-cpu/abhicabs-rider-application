/**
 * src/features/booking/screens/BookVehicleScreen.tsx
 *
 * Trip entry for a vehicle the rider picked from the fleet. Trip type, pickup,
 * stops, drop, and when — then on to the quote.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN EXISTS SEPARATELY FROM HOME
 * ---------------------------------------------------------------------------
 * Home is a map-first flow: the rider is placing a pin and the sheet is a
 * companion to it. Arriving from a vehicle card is the opposite order — the
 * vehicle is already decided and what is missing is the trip. Reusing Home
 * would drop the rider onto a map with no indication that the Sedan they just
 * tapped carried over, which is exactly the moment a chosen selection gets
 * silently lost.
 *
 * It writes to the SAME booking draft Home uses, so the quote step downstream
 * cannot tell which door the rider came through.
 *
 * ---------------------------------------------------------------------------
 * ON THE CHOSEN CLASS
 * ---------------------------------------------------------------------------
 * The class is carried as a PREFERENCE, not a commitment. The backend prices
 * every class for the route and returns them together; whether a class is
 * actually available depends on the city and the trip type. So this screen
 * remembers the pick and the quote screen leads with it — but it never promises
 * a vehicle the fare engine might not offer.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBookingDraft } from '../../../store/bookingDraft';
import { VEHICLES } from '../../../config/vehicles';
import {
  AddStopButton,
  DateCard,
  Divider,
  PlaceRow,
  PrimaryCta,
  RouteCard,
  StopRow,
  TripTypeTabs,
} from '../components/BookingShared';
import type { BookVehicleScreenProps } from '../../../navigation/types';
import { colors, layout, radius, spacing, type } from '../../../theme';

/** UI cap on intermediate stops, matching the draft store. */
const MAX_STOPS = 3;

export function BookVehicleScreen({ route, navigation }: BookVehicleScreenProps) {
  const vehicle = VEHICLES.find((v) => v.key === route.params.vehicleKey);

  const draft = useBookingDraft();
  const {
    tripType,
    pickup,
    drop,
    stops,
    pickupAt,
    returnAt,
    setTripType,
    removeStop,
    setPickupAt,
    setReturnAt,
  } = draft;

  const isRound = tripType === 'ROUND_TRIP';

  /**
   * Enough to price a trip: somewhere to start and somewhere to end. The when
   * always has a value (the draft defaults it to "soon"), so it can never be
   * the thing blocking the button.
   */
  const ready = Boolean(pickup && drop);

  const stopsShown = useMemo(() => stops.slice(0, MAX_STOPS), [stops]);

  const openSearch = (field: 'pickup' | 'drop' | 'stop', index?: number) =>
    navigation.navigate('PlaceSearch', { field, index });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The chosen vehicle, restated. Without it the rider has no assurance
            the tap they made two screens ago still counts. */}
        {vehicle ? (
          <View style={styles.chosen}>
            <Text style={styles.chosenGlyph}>{vehicle.glyph}</Text>
            <View style={styles.chosenText}>
              <Text style={styles.chosenLabel}>Selected vehicle</Text>
              <Text style={styles.chosenName}>{vehicle.name}</Text>
            </View>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.heading}>Where are you going?</Text>

        <TripTypeTabs
          value={tripType}
          onChange={setTripType}
          options={[
            { key: 'ONE_WAY', label: 'One way', icon: '⏱' },
            { key: 'ROUND_TRIP', label: 'Round trip', icon: '🚕' },
          ]}
        />

        <RouteCard>
          <PlaceRow
            kind="pickup"
            label="Pickup"
            value={pickup?.label ?? null}
            placeholder="Add pickup point"
            onPress={() => openSearch('pickup')}
          />

          {stopsShown.map((s, i) => (
            <View key={`stop-${i}`}>
              <Divider />
              <StopRow
                label={`Stop ${i + 1}`}
                value={s?.label ?? null}
                onPress={() => openSearch('stop', i)}
                onRemove={() => removeStop(i)}
              />
            </View>
          ))}

          <Divider />
          <PlaceRow
            kind="drop"
            label="Drop"
            value={drop?.label ?? null}
            placeholder="Where to?"
            onPress={() => openSearch('drop')}
          />

          <Divider />
          <AddStopButton
            onPress={() => openSearch('stop', stopsShown.length)}
            disabled={stopsShown.length >= MAX_STOPS}
          />
        </RouteCard>

        <Text style={styles.heading}>When?</Text>

        <DateCard
          label="Pickup date & time"
          value={pickupAt}
          onChange={setPickupAt}
          // No booking into the past. The backend rejects it too, but failing
          // here costs the rider one tap instead of a round trip.
          minimumDate={new Date()}
        />

        {/* Only a round trip has a return leg to ask about. */}
        {isRound ? (
          <View style={styles.returnWrap}>
            <DateCard
              label="Return date & time"
              value={returnAt ?? pickupAt}
              onChange={setReturnAt}
              minimumDate={new Date(pickupAt)}
            />
          </View>
        ) : null}

        <Text style={styles.note}>
          Your fare is calculated from this route and timing. You will see the price before
          anything is confirmed.
        </Text>
      </ScrollView>

      <View style={styles.bar}>
        <PrimaryCta
          label="See fare"
          disabled={!ready}
          onPress={() => navigation.navigate('FareOptions')}
        />
        {!ready ? (
          <Text style={styles.barHint}>Add a pickup and drop point to continue</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: layout.screenPaddingY,
    paddingBottom: 140,
  },

  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  chosenGlyph: { fontSize: 26 },
  chosenText: { flex: 1 },
  chosenLabel: { ...type.caption, fontSize: 10, color: colors.textMuted },
  chosenName: { ...type.label, fontSize: 15, color: colors.text },
  change: { ...type.label, fontSize: 13, color: colors.text },

  heading: { ...type.label, fontSize: 15, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },

  returnWrap: { marginTop: spacing.md },

  note: {
    ...type.caption,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.xl,
  },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.md,
    // Clears the home indicator / gesture bar on tall phones.
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  barHint: {
    ...type.caption,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});