/**
 * src/query/client.ts
 *
 * The TanStack Query client — the engine behind "no spinners". Its defaults are
 * tuned for mobile and for THIS backend:
 *
 *   - staleTime > 0 so screens render cached data instantly and refetch quietly
 *     in the background (stale-while-revalidate) instead of blocking on a spinner.
 *   - retry is delegated to the API client (which already handles 429/503/refresh),
 *     so Query itself does NOT retry — double-retrying would fight the backend's
 *     load shedding. The one exception: never retry a 4xx we own.
 *   - the cache is persisted to AsyncStorage, so a cold launch paints the last
 *     known bookings/trip immediately, even with no network, then reconciles.
 *
 * Query keys are centralized in `qk` so an invalidation from a socket event and
 * the query that produced the data can never disagree on the key.
 */

import { QueryClient } from '@tanstack/react-query';
import { AbhiApiError } from '../types/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API client owns retry/backoff/refresh. Don't double up.
      retry: false,
      // Instant paint from cache, background refresh. 30s suits trip/booking data.
      staleTime: 30_000,
      // Keep data around for offline cold-starts.
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false, // not meaningful on RN; AppState handles focus
    },
    mutations: {
      // Mutations carry idempotency keys, so a single bounded retry on transient
      // failure is safe. Auth/validation errors are not retried.
      retry: (failureCount, error) => {
        if (!(error instanceof AbhiApiError)) return false;
        return error.isRetryable && failureCount < 1;
      },
    },
  },
});

/** Centralized, typed query keys. Never build a key inline at a call site. */
export const qk = {
  me: ['me'] as const,
  bookings: {
    all: ['bookings'] as const,
    list: (filters?: Record<string, unknown>) => ['bookings', 'list', filters ?? {}] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
    summary: (id: string) => ['bookings', 'summary', id] as const,
  },
  fares: {
    options: (routeKey: string) => ['fares', 'options', routeKey] as const,
  },
  addresses: ['addresses'] as const,
} as const;