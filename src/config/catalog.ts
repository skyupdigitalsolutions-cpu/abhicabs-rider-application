/**
 * src/config/catalog.ts
 *
 * Serviced cities and vehicle classes.
 *
 * ---------------------------------------------------------------------------
 * TEMPORARY: these are PLACEHOLDER values, not confirmed against your backend.
 * ---------------------------------------------------------------------------
 * The customer-facing fare/booking endpoints require a numeric `cityId` and a
 * string `vehicleClass`, but docs/API.md exposes no public "list cities /
 * classes" endpoint. Until we confirm one (or read the exact values from
 * prisma/seed.js), the app uses this local list so the booking flow is buildable.
 *
 * The mock maps provider anchors everything near Bengaluru (lat 12.9716,
 * lng 77.5946), so Bengaluru is the safe default city to develop against.
 *
 * ACTION: replace CITIES and VEHICLE_CLASSES with the real seeded values.
 *   - If an endpoint exists: delete this file and use a cached useCities() hook.
 *   - If not: copy the exact ids/strings from prisma/seed.js.
 *
 * The vehicleClass STRINGS must match the backend exactly (case-sensitive) or
 * fare requests fail with FARE_CONFIG_MISSING. The zod schema only constrains
 * length (2–24 chars), so it will NOT catch a casing typo — the failure shows
 * up later as a missing fare config.
 */

export interface City {
  id: number;
  name: string;
  state: string;
  /** Approx. centre — used to bias autocomplete and centre the map. */
  center: { lat: number; lng: number };
}

export interface VehicleClassInfo {
  /** MUST match the backend fare_configs vehicleClass string exactly. */
  key: string;
  label: string; // shown to the user
  seats: number;
  description: string;
}

/** PLACEHOLDER — confirm against prisma/seed.js. */
export const CITIES: City[] = [
  { id: 1, name: 'Bengaluru', state: 'Karnataka', center: { lat: 12.9716, lng: 77.5946 } },
];

/**
 * VERIFIED against prisma/seed.js — the backend fare configs use LOWERCASE
 * vehicleClass strings. These must match exactly (case-sensitive) or fare
 * requests fail with FARE_CONFIG_MISSING.
 */
export const VEHICLE_CLASSES: VehicleClassInfo[] = [
  { key: 'hatchback', label: 'Hatchback', seats: 4, description: 'Compact, budget-friendly' },
  { key: 'sedan', label: 'Sedan', seats: 4, description: 'Comfortable for city rides' },
  { key: 'suv', label: 'SUV', seats: 6, description: 'More room, longer trips' },
  { key: 'tempo', label: 'Tempo Traveller', seats: 12, description: 'Group travel, large luggage' },
];

/** Look up display info for a class key returned by the fare endpoint. */
export function vehicleClassInfo(key: string): VehicleClassInfo {
  return (
    VEHICLE_CLASSES.find((v) => v.key === key) ?? {
      key, label: key, seats: 4, description: '',
    }
  );
}

/** The city the app defaults to until we add a city picker / geolocation. */
export const DEFAULT_CITY: City = CITIES[0]!;