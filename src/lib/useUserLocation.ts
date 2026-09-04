/**
 * src/lib/useUserLocation.ts
 *
 * Asks for foreground location permission once and returns the device's current
 * position. Kept deliberately small: one permission request, one fix, plus a
 * manual refresh. Screens that need continuous tracking should use a watcher
 * instead — for the home map, a single "where am I now" is enough.
 *
 * Never throws to the caller: on denial or error it returns a null coord and a
 * status, so the UI can fall back to the city centre rather than crash.
 */

import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LocStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export interface UserLocation {
  lat: number;
  lng: number;
}

export function useUserLocation() {
  const [coord, setCoord] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<LocStatus>('idle');

  const fetchOnce = useCallback(async () => {
    setStatus('loading');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { coord, status, refresh: fetchOnce };
}