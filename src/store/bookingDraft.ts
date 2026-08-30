/**
 * src/store/bookingDraft.ts
 *
 * The in-progress booking the user is assembling across screens: pickup, drop,
 * when, trip type, city. This is EPHEMERAL FLOW STATE, not server state, so it
 * belongs in a store rather than React Query — it has no server representation
 * until the booking is actually created.
 *
 * Why a store and not route params: the flow spans several screens (home ->
 * search -> options -> confirm), some fields are set on different screens, and
 * we want the draft to survive a screen unmounting. Threading a growing object
 * through navigation params would be brittle; a small store is cleaner.
 *
 * It is deliberately minimal and reset after a booking is created or abandoned.
 */

import { create } from 'zustand';
import { DEFAULT_CITY } from '../config/catalog';
import type { ChosenPlace, TripType } from '../types/domain';

interface BookingDraftState {
  cityId: number;
  tripType: TripType;
  pickup: ChosenPlace | null;
  drop: ChosenPlace | null;
  pickupAt: string; // ISO; defaults to "soon" and is editable later
  returnAt: string | null;

  // HOURLY (local rental): either a fixed package, or a flexible hours commitment.
  rentalPackageId: number | null;
  rentalHours: number | null;
  // AIRPORT: optional flight number.
  flightNumber: string | null;

  setPickup: (place: ChosenPlace | null) => void;
  setDrop: (place: ChosenPlace | null) => void;
  setTripType: (t: TripType) => void;
  setCity: (cityId: number) => void;
  setPickupAt: (iso: string) => void;
  setReturnAt: (iso: string | null) => void;
  setRentalPackageId: (id: number | null) => void;
  setRentalHours: (hours: number | null) => void;
  setFlightNumber: (fn: string | null) => void;
  swap: () => void;
  reset: () => void;
}

/** Default pickup time: 15 min out, matching the backend BOOKING_MIN_LEAD_MINUTES. */
function defaultPickupAt(): string {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

export const useBookingDraft = create<BookingDraftState>((set, get) => ({
  cityId: DEFAULT_CITY.id,
  tripType: 'ONE_WAY',
  pickup: null,
  drop: null,
  pickupAt: defaultPickupAt(),
  returnAt: null,
  rentalPackageId: null,
  rentalHours: null,
  flightNumber: null,

  setPickup: (place) => set({ pickup: place }),
  setDrop: (place) => set({ drop: place }),
  // Switching trip type clears the fields that only make sense for the old type,
  // so a leftover returnAt/package can't ride along into an incompatible quote.
  setTripType: (t) =>
    set({
      tripType: t,
      returnAt: t === 'ROUND_TRIP' ? get().returnAt : null,
      rentalPackageId: t === 'HOURLY' ? get().rentalPackageId : null,
      rentalHours: t === 'HOURLY' ? get().rentalHours : null,
      flightNumber: t === 'AIRPORT' ? get().flightNumber : null,
    }),
  setCity: (cityId) => set({ cityId }),
  setPickupAt: (iso) => set({ pickupAt: iso }),
  setReturnAt: (iso) => set({ returnAt: iso }),
  // Picking a fixed package clears any flexible-hours value, and vice-versa —
  // the backend takes one or the other, never both.
  setRentalPackageId: (id) => set({ rentalPackageId: id, rentalHours: id ? null : get().rentalHours }),
  setRentalHours: (hours) => set({ rentalHours: hours, rentalPackageId: hours ? null : get().rentalPackageId }),
  setFlightNumber: (fn) => set({ flightNumber: fn }),
  swap: () => set({ pickup: get().drop, drop: get().pickup }),
  reset: () =>
    set({
      cityId: DEFAULT_CITY.id,
      tripType: 'ONE_WAY',
      pickup: null,
      drop: null,
      pickupAt: defaultPickupAt(),
      returnAt: null,
      rentalPackageId: null,
      rentalHours: null,
      flightNumber: null,
    }),
}));