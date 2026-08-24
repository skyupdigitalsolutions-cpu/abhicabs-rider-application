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

  setPickup: (place: ChosenPlace | null) => void;
  setDrop: (place: ChosenPlace | null) => void;
  setTripType: (t: TripType) => void;
  setCity: (cityId: number) => void;
  setPickupAt: (iso: string) => void;
  setReturnAt: (iso: string | null) => void;
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

  setPickup: (place) => set({ pickup: place }),
  setDrop: (place) => set({ drop: place }),
  setTripType: (t) => set({ tripType: t, returnAt: t === 'ONE_WAY' ? null : get().returnAt }),
  setCity: (cityId) => set({ cityId }),
  setPickupAt: (iso) => set({ pickupAt: iso }),
  setReturnAt: (iso) => set({ returnAt: iso }),
  swap: () => set({ pickup: get().drop, drop: get().pickup }),
  reset: () =>
    set({
      cityId: DEFAULT_CITY.id,
      tripType: 'ONE_WAY',
      pickup: null,
      drop: null,
      pickupAt: defaultPickupAt(),
      returnAt: null,
    }),
}));