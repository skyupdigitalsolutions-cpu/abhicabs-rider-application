/**
 * src/realtime/socket.ts
 *
 * The realtime layer — this is the biggest "no waiting" lever in the app. The
 * backend pushes every meaningful change (trip:status, booking:allocated,
 * trip:location, payment:received) into a per-booking room. Instead of polling,
 * the app renders from these pushes and patches the Query cache directly, so the
 * trip screen updates the instant the server knows something.
 */

import { io, type Socket } from 'socket.io-client';
import { env } from '../config/env';
import { getAccessTokenSnapshot } from '../store/session';
import { queryClient, qk } from '../query/client';
import type {
  BookingAllocatedEvent,
  BookingSummary,
  PaymentReceivedEvent,
  TripLocationEvent,
  TripStatusEvent,
} from '../types/domain';

let socket: Socket | null = null;

/** Bookings the app currently wants live updates for (usually just the active one). */
const watched = new Set<string>();

/* ------------------------------- Connection -------------------------------- */

export function connectSocket(): Socket | null {
  if (socket?.connected) return socket;

  const token = getAccessTokenSnapshot();
  if (!token) {
    // No access token yet. This happens on a cold start: bootstrap() flips the
    // app to "authed" on the cached user while the refresh token is still being
    // exchanged for an access token in the BACKGROUND. Opening a socket now just
    // fails the handshake with AUTH_REQUIRED, so we don't. syncSocketAuth() —
    // called from the session layer the instant a token is minted — connects us.
    return socket;
  }

  if (socket) {
    // A socket object exists but is disconnected — reuse it with the live token
    // instead of stacking a second connection.
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(env.socketUrl, {
    transports: ['websocket'], // skip long-polling on mobile
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  });

  socket.on('connect', () => {
    // Fresh socket -> re-declare all watches and pull authoritative state.
    resyncWatches();
  });

  socket.on('connect_error', (err) => {
    // AUTH errors from the handshake ('TOKEN_EXPIRED', etc.) mean our token is
    // stale. The REST layer will refresh on its next call; force a reconnect
    // with the (soon) refreshed token rather than hammering with the old one.
    if (__DEV__) console.warn('[socket] connect_error', err.message);
  });

  bindEvents(socket);
  return socket;
}

export function disconnectSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  watched.clear();
}

/**
 * Point the socket at the CURRENT access token and make sure it's connected.
 * Safe to call anytime, from anywhere. This is what closes the cold-start gap:
 * it's invoked from the session layer every time a token is minted or rotated
 * (login, cold-start refresh, transparent refresh), so a socket that couldn't
 * connect yet (no token) gets created, and a live socket carrying a stale token
 * gets reconnected with the fresh one.
 */
export function syncSocketAuth(): void {
  const token = getAccessTokenSnapshot();
  if (!token) return;                 // nothing to authenticate with yet
  if (!socket) { connectSocket(); return; } // not created yet → create with the token
  socket.auth = { token };
  if (socket.connected) socket.disconnect().connect();
  else socket.connect();
}

/** Reconnect with the current (possibly rotated) access token. */
export function reauthSocket(): void {
  syncSocketAuth();
}

/* --------------------------------- Watching -------------------------------- */

/**
 * Start receiving live updates for a booking. Idempotent. On connect we also
 * refetch the summary over REST so the screen shows authoritative state before
 * the first push arrives.
 */
export function watchBooking(bookingId: string): void {
  watched.add(bookingId);
  if (socket?.connected) {
    socket.emit('booking:watch', bookingId, (ack: { ok: boolean }) => {
      if (!ack?.ok && __DEV__) console.warn('[socket] watch rejected', bookingId);
    });
    // Authoritative refresh: never rely solely on the first push.
    queryClient.invalidateQueries({ queryKey: qk.bookings.summary(bookingId) });
  }
}

export function unwatchBooking(bookingId: string): void {
  watched.delete(bookingId);
  socket?.emit('booking:unwatch', bookingId);
}

/** Re-declare every active watch in one round-trip after a (re)connect. */
function resyncWatches(): void {
  if (!socket?.connected || watched.size === 0) return;
  const ids = [...watched];
  socket.emit('resync', ids, (ack: { ok: boolean; watching: string[] }) => {
    // After resync, the socket may have missed events while asleep. Pull the
    // truth over REST for everything we watch, then live pushes take over.
    const confirmed = ack?.watching ?? ids;
    for (const id of confirmed) {
      queryClient.invalidateQueries({ queryKey: qk.bookings.summary(id) });
    }
  });
}

/* ---------------------------- Event -> cache bridge ------------------------ */

function bindEvents(s: Socket): void {
  // trip:status — patch status in the cached summary, and nudge the list.
  s.on('trip:status', (e: TripStatusEvent) => {
    patchSummary(e.bookingId, (prev) => ({
      ...prev,
      booking: { ...prev.booking, status: e.status },
    }));
    queryClient.invalidateQueries({ queryKey: qk.bookings.all });
  });

  // booking:allocated — a driver/vehicle is assigned. Summary now has richer
  // data (driver/vehicle), which we don't get in this event, so invalidate to
  // pull the full allocation rather than guessing.
  s.on('booking:allocated', (e: BookingAllocatedEvent) => {
    queryClient.invalidateQueries({ queryKey: qk.bookings.summary(e.bookingId) });
  });

  // trip:location — the live car position. This fires every few seconds, so we
  // patch the cache in place (NO refetch) to keep the map buttery.
  s.on('trip:location', (e: TripLocationEvent) => {
    patchSummary(e.bookingId, (prev) => ({
      ...prev,
      liveLocation: {
        driverId: e.driverId,
        lat: e.lat,
        lng: e.lng,
        speed: e.speed,
        heading: e.heading,
        lastPingAt: e.at,
      },
    }));
  });

  // payment:received — reflect immediately, then reconcile the authoritative
  // payment list/invoice.
  s.on('payment:received', (e: PaymentReceivedEvent) => {
    queryClient.invalidateQueries({ queryKey: qk.bookings.summary(e.bookingId) });
  });
}

/** Immutable in-place patch of a cached BookingSummary; no-op if not cached. */
function patchSummary(
  bookingId: string,
  updater: (prev: BookingSummary) => BookingSummary,
): void {
  queryClient.setQueryData<BookingSummary>(
    qk.bookings.summary(bookingId),
    (prev: BookingSummary | undefined) => (prev ? updater(prev) : prev),
  );
}