/**
 * src/types/domain.ts
 *
 * Domain enums and shapes, mirrored from the backend Prisma schema and the
 * documented select shapes (booking.model.js BOOKING_SELECT / BOOKING_LIST_SELECT,
 * summary.service.js). These are the objects the UI renders.
 *
 * NOTE ON EXACTNESS: enums are copied verbatim from schema.prisma and are safe.
 * The nested `FareQuote` line-item names below are inferred from docs/API.md and
 * should be reconciled against one real `POST /fares/estimate` response before we
 * ship the fare screen — I have flagged that field with a TODO.
 */

/* ----------------------------- Enums (verbatim) ---------------------------- */

export type Role =
  | 'USER'
  | 'ADMIN'
  | 'DRIVER'
  | 'OPS'
  | 'FINANCE'
  | 'FLEET'
  | 'SUPPORT';

export type TripType = 'ONE_WAY' | 'ROUND_TRIP' | 'AIRPORT' | 'HOURLY';

/**
 * The high-level service the user is booking, matching the app's top tabs.
 * OUTSTATION splits into ONE_WAY / ROUND_TRIP; LOCAL maps to HOURLY; AIRPORT is
 * its own TripType. This is a UI grouping — the wire always sends a TripType.
 */
export type ServiceKind = 'OUTSTATION' | 'LOCAL' | 'AIRPORT';

/** A fixed local-rental package (4hr/40km, 8hr/80km, 12hr/120km). */
export interface RentalPackage {
  id: number;
  cityId: number;
  vehicleClass: string;
  label: string;
  includedHours: number;
  includedKm: number;
  packageFare: string;
  extraPerHour: string;
  extraPerKm: string;
}

export type PaymentMode = 'ZERO' | 'PARTIAL' | 'FULL';

export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'CASH';

/** Forward-only lifecycle. The trip UI is essentially a renderer for this. */
export type BookingStatus =
  | 'ATTEMPTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'ALLOCATED'
  | 'EN_ROUTE'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PaymentStatus =
  | 'CREATED'
  | 'AUTHORISED'
  | 'CAPTURED'
  | 'PARTIALLY_PAID'
  | 'FAILED'
  | 'REFUNDED';

export type CancelledBy = 'CUSTOMER' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

/** Statuses where a trip is live and a car may be moving on the map. */
export const IN_MOTION_STATUSES: readonly BookingStatus[] = [
  'ALLOCATED',
  'EN_ROUTE',
  'ONGOING',
];

/** Statuses that are terminal — no further transitions, stop watching the room. */
export const TERMINAL_STATUSES: readonly BookingStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
];

export const isInMotion = (s: BookingStatus): boolean =>
  IN_MOTION_STATUSES.includes(s);
export const isTerminal = (s: BookingStatus): boolean =>
  TERMINAL_STATUSES.includes(s);

/* ------------------------------- Primitives -------------------------------- */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Monetary amounts cross the wire as decimal strings (backend uses decimal.js). */
export type Money = string;

/* --------------------------------- User ------------------------------------ */

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  isActive?: boolean;
}

/** What /auth/login, /auth/register, /auth/otp/verify return. */
export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/** What /auth/refresh returns (tokens only; refresh is rotated). */
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/* ------------------------------- Addresses --------------------------------- */

export interface SavedAddress {
  id: string;
  label: string;
  line1: string;
  lat: number;
  lng: number;
  city?: string | null;
  formattedAddress?: string | null;
}

/* --------------------------------- Fares ----------------------------------- */

export interface FareEstimateRequest {
  cityId: number;
  vehicleClass: string;
  tripType: TripType;
  pickup: LatLng;
  drop: LatLng;
  pickupAt: string; // ISO
  returnAt?: string; // ISO, ROUND_TRIP only
  // HOURLY: a fixed package id OR a flexible hours commitment.
  rentalPackageId?: number | null;
  rentalHours?: number | null;
  // AIRPORT: optional flight number for driver flight-tracking.
  flightNumber?: string | null;
}

/**
 * Itemised fare quote. Field names follow docs/API.md's description
 * (base, distance, time, night, returnEmpty, surge, minFare, total).
 * TODO(verify): confirm nested key names/casing against a live estimate response.
 */
export interface FareQuote {
  vehicleClass: string;
  tripType: TripType;
  currency: string; // e.g. "INR"
  distanceKm: number;
  durationMin: number;
  surgeMultiplier: number;
  breakdown: {
    base: Money;
    distance: Money;
    time: Money;
    night: Money;
    returnEmpty: Money;
    surge: Money;
    minFare: Money;
  };
  total: Money;
}

/** One row of POST /fares/options — a quote per vehicle class for the route. */
export interface FareOption {
  vehicleClass: string;
  total: Money;
  currency: string;
  quote: FareQuote;
}

/* -------------------------------- Bookings --------------------------------- */

/** List shape — the lightweight rows for booking history (BOOKING_LIST_SELECT). */
export interface BookingListItem {
  id: string;
  bookingNumber: string;
  tripType: TripType;
  status: BookingStatus;
  vehicleClass: string;
  pickupAddress: string;
  dropAddress: string;
  pickupAt: string;
  returnAt: string | null;
  distanceKm: number | null;
  estimatedFare: Money | null;
  finalFare: Money | null;
  paymentMode: PaymentMode;
  createdAt: string;
}

/** Detail shape — the full booking (BOOKING_SELECT), used on the trip screen. */
export interface Booking extends BookingListItem {
  customerId: string;
  cityId: number;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  advancePaid: Money | null;
  balanceDue: Money | null;
  cancellationFee: Money | null;
  refundAmount: Money | null;
  paymentMethod: PaymentMethod | null;
  surgeMultiplier: number | null;
  cancelledAt: string | null;
  cancelledByType: CancelledBy | null;
  cancellationReason: string | null;
  specialRequests: string | null;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface CreateBookingRequest {
  cityId: number;
  vehicleClass: string;
  tripType: TripType;
  pickup: LatLng;
  drop: LatLng;
  pickupAt: string;
  returnAt?: string;
  scheduled?: boolean;
  paymentMode: PaymentMode;
  specialRequests?: string;
  // HOURLY
  rentalPackageId?: number | null;
  rentalHours?: number | null;
  // AIRPORT
  flightNumber?: string | null;
}

/* -------------------------------- Payments --------------------------------- */

export interface Payment {
  id: string;
  bookingId: string;
  status: PaymentStatus;
  amount: Money;
  purpose: 'ADVANCE' | 'FULL' | 'BALANCE';
  method: PaymentMethod | null;
  createdAt: string;
}

export interface Allocation {
  id: string;
  bookingId: string;
  driverId: string | null;
  vehicleId: string | null;
  status: 'ACTIVE' | 'RELEASED' | 'CANCELLED';
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNumber?: string | null;
}

export interface LiveLocation {
  driverId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  lastPingAt: string | null;
}

/**
 * The aggregate that GET /bookings/:id/summary returns — booking + payments +
 * allocation + invoice + live location in one round-trip. This is the single
 * most important read for the trip screen (see summary.service.js).
 */
export interface BookingSummary {
  booking: Booking;
  payments: Payment[];
  allocation: Allocation | null;
  invoice: Invoice | null;
  liveLocation: LiveLocation | null;
}

export interface Invoice {
  id: string;
  bookingId: string;
  type: 'TAX' | 'NON_TAX';
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  total: Money;
  gst?: Money;
  number?: string;
}

/* ------------------------- Realtime event payloads ------------------------- */

/** trip:status — booking moved along the lifecycle. */
export interface TripStatusEvent {
  bookingId: string;
  bookingNumber: string;
  status: BookingStatus;
  at: string;
}

/** booking:allocated — a vehicle/driver was assigned. */
export interface BookingAllocatedEvent {
  bookingId: string;
  allocationId: string;
  vehicleId: string | null;
  at: string;
}

/** trip:location — the assigned driver's live position for a watched booking. */
export interface TripLocationEvent {
  bookingId: string;
  driverId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  at: string;
}

/** payment:received — a payment settled for a watched booking. */
export interface PaymentReceivedEvent {
  bookingId: string;
  paymentId: string;
  amount: Money;
  purpose: string;
  at: string;
}
// Add after the SavedAddress interface

/** A suggestion item returned by the autocomplete endpoint. */
export interface PlaceSuggestion {
  description: string;
  placeId: string;
}

/**
 * A fully-resolved place (has coordinates). Written into the booking draft
 * after the user selects an autocomplete suggestion and we geocode it.
 */
export interface ChosenPlace {
  label: string;
  lat: number;
  lng: number;
  placeId: string | null;
}