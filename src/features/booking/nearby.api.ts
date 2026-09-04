/**
 * src/features/booking/nearby.api.ts
 *
 * "Cars near me" for the home map. Given a centre coordinate, fetches the
 * anonymized nearby-driver dots and refreshes them on a gentle interval so the
 * map feels live without hammering the backend. Disabled until we have a coord.
 */

import { useQuery } from '@tanstack/react-query';
import { fareApi } from '../../api/endpoints';

export interface CarDot {
  lat: number;
  lng: number;
}

export function useNearbyCars(centre: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['nearbyCars', centre?.lat, centre?.lng],
    enabled: !!centre,
    queryFn: async (): Promise<CarDot[]> => {
      if (!centre) return [];
      const res = await fareApi.nearbyCars(centre.lat, centre.lng, 5);
      return res.cars ?? [];
    },
    // Live-ish: refetch every 20s while the screen is mounted. Cars have a short
    // server-side TTL, so this keeps the dots roughly current.
    refetchInterval: 20_000,
    staleTime: 15_000,
  });
}