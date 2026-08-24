/**
 * src/features/trip/api.ts
 *
 * Data layer for the live trip screen. The heavy lifting lives elsewhere:
 *   - the SUMMARY query is the single read (booking + payments + allocation +
 *     invoice + live location) — one round-trip for the whole screen.
 *   - the SOCKET module patches that same cached summary in place as events
 *     arrive, so this screen re-renders live without polling.
 * This hook just owns the query + the watch lifecycle.
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from '../../api/endpoints';
import { qk } from '../../query/client';
import { watchBooking, unwatchBooking } from '../../realtime/socket';
import { newIdempotencyKey } from '../../lib/idempotency';
import { isTerminal } from '../../types/domain';
import type { BookingSummary } from '../../types/domain';

/**
 * The live trip. Reads the summary aggregate and, while mounted, watches the
 * booking's realtime room. A light poll is kept as a backstop to the socket
 * (in case a push is missed), and it stops once the trip is terminal.
 */
export function useTripSummary(bookingId: string) {
  const query = useQuery({
    queryKey: qk.bookings.summary(bookingId),
    queryFn: async () => bookingApi.summary(bookingId),
    // Backstop poll only while the trip is live; terminal trips never change.
    refetchInterval: (q) => {
      const data = q.state.data as BookingSummary | undefined;
      if (!data) return 10_000;
      return isTerminal(data.booking.status) ? false : 15_000;
    },
  });

  // Watch the booking's room while this screen is on-screen; the socket module
  // patches the cache as events arrive.
  useEffect(() => {
    watchBooking(bookingId);
    return () => unwatchBooking(bookingId);
  }, [bookingId]);

  return query;
}

/** Cancel the trip. Mints an idempotency key; refreshes the summary + lists. */
export function useCancelTrip(bookingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      bookingApi.cancel(bookingId, reason, newIdempotencyKey()).then((r) => r.booking),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bookings.summary(bookingId) });
      qc.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });
}