import Constants from 'expo-constants';

function readExtra(key: string): string | undefined {
  const fromEnv = process.env[`EXPO_PUBLIC_${key}`];
  if (fromEnv) return fromEnv;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
  return extra[key];
}

function required(key: string): string {
  const value = readExtra(key);
  if (!value || value.trim() === '') {
    throw new Error(
      `[config] Missing EXPO_PUBLIC_${key}. Set it in .env (see .env.example).`,
    );
  }
  return value.trim();
}

const API_URL = required('API_URL');

/**
 * Key for the Maps JavaScript API used by the WebView map on the home screen.
 *
 * This is NOT necessarily the same key as `android.config.googleMaps.apiKey`
 * in app.json. That one is for the native Maps SDK for Android and is normally
 * restricted by package name + SHA-1 certificate fingerprint. A WebView makes
 * an ordinary *web* request, so an Android-restricted key is rejected there —
 * the map comes back blank with a RefererNotAllowedMapError.
 *
 * Set EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY to a key that has the Maps JavaScript API
 * enabled. We fall back to the native key so the map still tries to load in a
 * fresh checkout, but expect that fallback to fail once key restrictions are on.
 */
function nativeAndroidMapsKey(): string | undefined {
  const android = Constants.expoConfig?.android as
    | { config?: { googleMaps?: { apiKey?: string } } }
    | undefined;
  return android?.config?.googleMaps?.apiKey;
}

const MAPS_JS_KEY = readExtra('GOOGLE_MAPS_JS_KEY') ?? nativeAndroidMapsKey() ?? '';

export const env = {
  environment: (process.env.EXPO_PUBLIC_ENV as 'development' | 'production') ?? 'development',
  isProduction: process.env.EXPO_PUBLIC_ENV === 'production',
  apiUrl: API_URL,
  apiPrefix: '/api/v1',
  socketUrl: API_URL,
  mapsJsKey: MAPS_JS_KEY,
  /**
   * Origin the WebView reports for its HTML document. Google sees this as the
   * HTTP referer, so the Maps JS key can be locked to it instead of being left
   * unrestricted. Must match a referrer entry on the key in Google Cloud.
   */
  mapsWebOrigin: 'https://maps.abhicabs.app',
  requestTimeoutMs: 15_000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
  },
} as const;

export type AppEnv = typeof env;