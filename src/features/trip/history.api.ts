/**
 * src/features/trip/history.api.ts
 *
 * Booking history for the Trips screen. Paginated list of the customer's own
 * bookings, newest first. The server scopes to the caller, so this returns only
 * the signed-in rider's trips.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { bookingApi } from '../../api/endpoints';
import { qk } from '../../query/client';
import type { BookingListItem } from '../../types/domain';

const PAGE_SIZE = 20;

interface Page {
  bookings: BookingListItem[];
  page: number;
}

/**
 * Infinite list of the rider's bookings. Pulls one page at a time; the screen
 * calls fetchNextPage when the list nears its end. A short staleTime keeps a
 * return-to-screen snappy without hiding a just-created booking for long.
 */
export function useTripHistory() {
  return useInfiniteQuery({
    queryKey: qk.bookings.history,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await bookingApi.list({ page: pageParam as number, limit: PAGE_SIZE });
      return { bookings: res.bookings, page: res.page } as Page;
    },
    getNextPageParam: (last) =>
      last.bookings.length === PAGE_SIZE ? last.page + 1 : undefined,
    staleTime: 30_000,
  });
}