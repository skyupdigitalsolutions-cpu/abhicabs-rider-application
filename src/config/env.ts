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

export const env = {
  environment: (process.env.EXPO_PUBLIC_ENV as 'development' | 'production') ?? 'development',
  isProduction: process.env.EXPO_PUBLIC_ENV === 'production',
  apiUrl: API_URL,
  apiPrefix: '/api/v1',
  socketUrl: API_URL,
  requestTimeoutMs: 15_000,
  retry: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 8_000,
  },
} as const;

export type AppEnv = typeof env;