/**
 * src/api/endpoints.ts
 *
 * Thin, typed wrappers around each backend endpoint the rider app uses. One
 * function per endpoint, returning the already-unwrapped `data`. Screens and
 * hooks call these; nobody calls `http` directly, so the URL strings and their
 * shapes live in exactly one place.
 */

import { http } from './client';
import type {
  AuthResult,
  AuthUser,
  Booking,
  BookingListItem,
  BookingSummary,
  CreateBookingRequest,
  FareEstimateRequest,
  FareOption,
  RentalPackage,
  FareQuote,
  Payment,
  SavedAddress,
} from '../types/domain';

/* ---------------------------------- Auth ----------------------------------- */

export const authApi = {
  requestOtp: (phone: string) =>
    http.post<{ requested: boolean }>('/auth/otp/request', { phone }, { auth: false }),

  verifyOtp: (phone: string, code: string) =>
    http.post<AuthResult>('/auth/otp/verify', { phone, code }, { auth: false }),

  loginPassword: (email: string, password: string) =>
    http.post<AuthResult>('/auth/login', { email, password }, { auth: false }),

  register: (input: { name: string; email: string; phone: string }) =>
    http.post<AuthResult>('/auth/register', input, { auth: false }),

  me: () => http.get<{ user: AuthUser; permissions: string[] }>('/auth/me'),

  logout: (refreshToken: string) =>
    http.post<unknown>('/auth/logout', { refreshToken }, { auth: false }),

  logoutAll: () => http.post<unknown>('/auth/logout-all'),
};

/* ------------------------------- Customer/self ----------------------------- */

export const customerApi = {
  me: () => http.get<{ customer: unknown }>('/customers/me'),

  addresses: () => http.get<{ addresses: SavedAddress[] }>('/customers/me/addresses'),

  addAddress: (input: Omit<SavedAddress, 'id'>) =>
    http.post<{ address: SavedAddress }>('/customers/me/addresses', input),

  deleteAddress: (id: string) => http.del<unknown>(`/customers/me/addresses/${id}`),
};

/* ---------------------------------- Fares ---------------------------------- */

export const fareApi = {
  estimate: (input: FareEstimateRequest) =>
    http.post<{ quote: FareQuote }>('/fares/estimate', input),

  options: (input: Omit<FareEstimateRequest, 'vehicleClass'>) =>
    http.post<{ options: FareOption[] }>('/fares/options', input),

  /** Local-rental packages (4/40, 8/80, 12/120) for the hourly picker. */
  rentalPackages: (cityId: number, vehicleClass?: string) =>
    http.get<{ packages: RentalPackage[] }>('/fares/rental-packages', {
      query: { cityId, ...(vehicleClass ? { vehicleClass } : {}) },
    }),

  // ✅ Added optional bias param; renamed response key from predictions → suggestions
  autocomplete: (q: string, bias?: { lat: number; lng: number }) =>
    http.get<{ suggestions: Array<{ description: string; placeId: string }> }>(
      '/fares/autocomplete',
      { query: { q, ...(bias ? { lat: bias.lat, lng: bias.lng } : {}) } },
    ),

  // Geocode is a POST on the backend (address in the body), returning
  // { location: { lat, lng, placeId } }.
  geocode: (address: string) =>
    http.post<{ location: { lat: number; lng: number; placeId?: string } }>(
      '/fares/geocode',
      { address },
    ),

  reverseGeocode: (lat: number, lng: number) =>
    http.get<{ location: { lat: number; lng: number; formattedAddress: string; placeId: string | null } }>(
      '/fares/reverse-geocode',
      { query: { lat, lng } },
    ),

  // Road route geometry (the polyline that follows streets) for drawing on a map.
  route: (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) =>
    http.post<{
      route: {
        points: { lat: number; lng: number }[];
        distanceKm: number;
        durationMin: number | null;
        provider: string;
      };
    }>('/fares/route', { origin, destination }),

  // Anonymized "cars near me" for the home map: { count, cars: [{lat,lng}] }.
  nearbyCars: (lat: number, lng: number, radiusKm = 5) =>
    http.get<{ count: number; cars: { lat: number; lng: number }[] }>(
      '/location/nearby-cars',
      { query: { lat, lng, radiusKm } },
    ),
};

/* -------------------------------- Bookings --------------------------------- */

export const bookingApi = {
  /** Create a booking. Idempotency-Key is mandatory here — mint once, reuse on retry. */
  create: (input: CreateBookingRequest, idempotencyKey: string) =>
    http.post<{ booking: Booking }>('/bookings', input, { idempotencyKey }),

  list: (params?: { page?: number; limit?: number; status?: string; tripType?: string }) =>
    http.get<{
      items: BookingListItem[];
      pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
    }>('/bookings', { query: params }),

  get: (id: string) => http.get<{ booking: Booking }>(`/bookings/${id}`),

  /** The aggregate — one call for the whole trip screen. Prefer this over get(). */
  summary: (id: string) => http.get<BookingSummary>(`/bookings/${id}/summary`),

  actions: (id: string) => http.get<{ actions: string[] }>(`/bookings/${id}/actions`),

  cancellationQuote: (id: string) =>
    http.get<{ fee: string; refund: string; band: string }>(`/bookings/${id}/cancellation-quote`),

  cancel: (id: string, reason: string | undefined, idempotencyKey: string) =>
    http.post<{ booking: Booking; refund: string }>(
      `/bookings/${id}/cancel`,
      { reason },
      { idempotencyKey },
    ),
};

/* -------------------------------- Payments --------------------------------- */

export const paymentApi = {
  createOrder: (
    bookingId: string,
    purpose: 'ADVANCE' | 'FULL' | 'BALANCE',
    idempotencyKey: string,
  ) =>
    http.post<{ payment: Payment; order: unknown }>(
      '/payments/orders',
      { bookingId, purpose },
      { idempotencyKey },
    ),

  get: (id: string) => http.get<{ payment: Payment }>(`/payments/${id}`),

  // DEV ONLY (mock gateway): drive a signed "captured" webhook through the real
  // ingest pipeline so the payment settles exactly as a live gateway callback
  // would. Deterministic on eventId, so a retry is a safe replay.
  simulateWebhook: (paymentId: string, eventId: string) =>
    http.post<{ changed: boolean }>(
      `/payments/${paymentId}/simulate-webhook`,
      { eventId, status: 'captured' },
    ),
};