/**
 * src/features/booking/api.ts
 *
 * Data hooks for the booking flow's first stage: saved addresses and place
 * search. Autocomplete is a QUERY (cached per search term); geocoding on select
 * is an explicit async call, not a hook, because it happens once on a tap.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi, customerApi, fareApi } from '../../api/endpoints';
import { qk } from '../../query/client';
import { newIdempotencyKey } from '../../lib/idempotency';
import type {
  ChosenPlace, CreateBookingRequest, PlaceSuggestion, TripType,
} from '../../types/domain';

/** The customer's saved addresses (Home, Office, ...). Cached; rarely changes. */
export function useSavedAddresses() {
  return useQuery({
    queryKey: qk.addresses,
    queryFn: async () => (await customerApi.addresses()).addresses,
    staleTime: 5 * 60 * 1000, // 5 min — addresses change rarely
  });
}

/**
 * Place autocomplete for a (debounced) search term. Disabled below 3 chars,
 * mirroring the backend's minimum, so we never fire a request the server rejects.
 */
export function usePlaceSearch(term: string, bias?: { lat: number; lng: number }) {
  const enabled = term.trim().length >= 3;
  return useQuery({
    queryKey: ['places', 'autocomplete', term.trim(), bias ?? null],
    queryFn: async () => (await fareApi.autocomplete(term.trim(), bias)).suggestions,
    enabled,
    staleTime: 60 * 1000, // identical searches within a minute reuse the result
  });
}

/**
 * Resolve a chosen suggestion to coordinates. Autocomplete gives no lat/lng, so
 * selecting a place requires geocoding its description. Returns the app's
 * internal ChosenPlace shape ready to drop into the booking draft.
 */
export async function resolveSuggestion(s: PlaceSuggestion): Promise<ChosenPlace> {
  const { location } = await fareApi.geocode(s.description);
  return {
    label: s.description,
    lat: location.lat,
    lng: location.lng,
    placeId: location.placeId ?? s.placeId ?? null,
  };
}
/* ------------------------------- Fare options ------------------------------ */

/**
 * A stable key for a route+time so identical requests share one cache entry —
 * revisiting the fare screen for the same trip paints instantly instead of
 * re-quoting. Coordinates are rounded so trivially-different GPS fixes still hit
 * the same cache line.
 */
function routeKey(args: {
  cityId: number;
  tripType: TripType;
  pickup: ChosenPlace;
  drop: ChosenPlace;
  pickupAt: string;
  returnAt: string | null;
  rentalPackageId?: number | null;
  rentalHours?: number | null;
}): string {
  const r = (n: number) => n.toFixed(4);
  return [
    args.cityId, args.tripType,
    r(args.pickup.lat), r(args.pickup.lng),
    r(args.drop.lat), r(args.drop.lng),
    args.pickupAt, args.returnAt ?? '-',
    args.rentalPackageId ?? '-', args.rentalHours ?? '-',
  ].join('|');
}

/**
 * Quote every vehicle class for the drafted route. Enabled only when both ends
 * have coordinates, mirroring what the backend needs. Cached by route signature.
 */
export function useFareOptions(args: {
  cityId: number;
  tripType: TripType;
  pickup: ChosenPlace | null;
  drop: ChosenPlace | null;
  pickupAt: string;
  returnAt: string | null;
  rentalPackageId?: number | null;
  rentalHours?: number | null;
  flightNumber?: string | null;
}) {
  const ready = Boolean(
    args.pickup && args.drop &&
    Number.isFinite(args.pickup.lat) && Number.isFinite(args.drop.lat) &&
    // HOURLY needs a package or an hours commitment before it can be quoted.
    (args.tripType !== 'HOURLY' || args.rentalPackageId || args.rentalHours),
  );
  const key = ready
    ? routeKey({ ...args, pickup: args.pickup as ChosenPlace, drop: args.drop as ChosenPlace })
    : 'incomplete';

  return useQuery({
    queryKey: qk.fares.options(key),
    enabled: ready,
    staleTime: 60 * 1000, // a quote is good for ~a minute
    queryFn: async () => {
      const p = args.pickup as ChosenPlace;
      const d = args.drop as ChosenPlace;
      return (
        await fareApi.options({
          cityId: args.cityId,
          tripType: args.tripType,
          pickup: { lat: p.lat, lng: p.lng },
          drop: { lat: d.lat, lng: d.lng },
          pickupAt: args.pickupAt,
          ...(args.returnAt ? { returnAt: args.returnAt } : {}),
          ...(args.rentalPackageId ? { rentalPackageId: args.rentalPackageId } : {}),
          ...(args.rentalHours ? { rentalHours: args.rentalHours } : {}),
          ...(args.flightNumber ? { flightNumber: args.flightNumber } : {}),
        })
      ).options;
    },
  });
}

/** Local-rental packages for the hourly picker, grouped by the app as needed. */
export function useRentalPackages(cityId: number, vehicleClass?: string) {
  return useQuery({
    queryKey: ['rental-packages', cityId, vehicleClass ?? 'all'],
    queryFn: async () => (await fareApi.rentalPackages(cityId, vehicleClass)).packages,
    staleTime: 10 * 60 * 1000, // packages change rarely
  });
}

/* ------------------------------ Create booking ----------------------------- */

/**
 * Creates a booking. Mints ONE idempotency key per attempt and reuses it across
 * the mutation's retry, so a network hiccup can never create two bookings — the
 * backend collapses the retry to the same booking. On success, booking lists are
 * invalidated so history reflects the new trip.
 */
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingRequest) =>
      bookingApi.create(input, newIdempotencyKey()).then((r) => r.booking),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });
}