/**
 * src/lib/useUserLocation.ts
 *
 * Asks for foreground location permission once and returns the device's current
 * position. Screens that need continuous tracking should use a watcher instead —
 * for the home map, a single "where am I now" is enough.
 *
 * Never throws to the caller: on denial, timeout or error it returns a null
 * coord plus a status, so the UI can fall back to the city centre rather than
 * show nothing. NOTE that this hook does not apply the fallback itself — the
 * caller decides, because "we do not know where you are" and "here is a
 * default" are different facts and some callers need to tell them apart.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A TIMEOUT
 * ---------------------------------------------------------------------------
 * getCurrentPositionAsync has NO timeout of its own. On a device with no recent
 * GPS fix — a cold start indoors, an emulator with no location set, or Play
 * Services location switched off — it can stay pending indefinitely. The hook
 * then sits on status 'loading' forever, and any screen keyed off that status
 * shows a spinner that never resolves. A hung promise is indistinguishable from
 * a slow one, so we cap it and treat the cap as a normal failure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type LocStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'timeout' | 'error';

export interface UserLocation {
  lat: number;
  lng: number;
}

/** How long to wait for a fresh fix before giving up. */
const FIX_TIMEOUT_MS = 8000;

/**
 * Live-tracking cadence. Deliberately coarse: the home map only needs to show
 * roughly where the rider is, and a tight interval would wake the GPS
 * constantly for a dot that moves a few pixels. Distance filtering does most
 * of the work — standing still produces no updates at all.
 */
const WATCH_INTERVAL_MS = 5000;
const WATCH_DISTANCE_M = 10;

/** Resolves to null instead of hanging or rejecting past the deadline. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * @param watch  keep the position updating after the first fix. Off by default
 *               because most callers want a one-shot "where am I" — leaving a
 *               GPS subscription running on every screen that asks would cost
 *               battery for nothing.
 */
export function useUserLocation(watch = false) {
  const [coord, setCoord] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<LocStatus>('idle');

  // Guards against setting state after the screen has gone away.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchOnce = useCallback(async () => {
    if (alive.current) setStatus('loading');

    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        if (alive.current) setStatus('denied');
        return;
      }

      // Fast path: the OS usually has a recent fix cached from another app, and
      // it comes back immediately. Show that first so the map has something to
      // draw within a frame or two, then refine it below.
      const last = await withTimeout(Location.getLastKnownPositionAsync(), 2000);
      if (last && alive.current) {
        setCoord({ lat: last.coords.latitude, lng: last.coords.longitude });
        setStatus('granted');
      }

      // Accurate path, capped so it cannot hang the UI.
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        FIX_TIMEOUT_MS,
      );

      if (!alive.current) return;

      if (pos) {
        setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      } else if (!last) {
        // No cached fix and no fresh one. Distinct from 'denied': permission was
        // granted, the hardware just did not deliver. The caller falls back.
        setStatus('timeout');
      }
    } catch {
      if (alive.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  /**
   * Live tracking. Starts only once permission has been granted, so it never
   * triggers a second permission prompt, and tears the subscription down on
   * unmount — an orphaned watcher keeps the GPS awake for the life of the app.
   */
  useEffect(() => {
    if (!watch || status !== 'granted') return;

    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: WATCH_INTERVAL_MS,
        distanceInterval: WATCH_DISTANCE_M,
      },
      (pos) => {
        if (!alive.current) return;
        setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
    )
      .then((s) => {
        // Unmounted while the subscription was being set up.
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {
        // A failed watcher is not fatal — the one-shot fix still stands.
      });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watch, status]);

  /** True once we have stopped waiting — the caller should use its own default. */
  const resolved =
    status === 'granted' || status === 'denied' || status === 'timeout' || status === 'error';

  return { coord, status, resolved, refresh: fetchOnce };
}