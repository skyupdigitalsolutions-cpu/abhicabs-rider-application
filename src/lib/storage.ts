import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../types/domain';

const REFRESH_TOKEN_KEY = 'abhicabs.refresh_token';
const CACHED_USER_KEY = 'abhicabs.cached_user';

export const secureStore = {
  async getRefreshToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async clearRefreshToken(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      /* deleting a non-existent key is fine */
    }
  },

  /**
   * A cached snapshot of the last known user — NON-sensitive profile fields only
   * (name, phone, email), used to paint the authed UI instantly on cold start
   * before /auth/me confirms. Stored in AsyncStorage (fast, unencrypted) rather
   * than the keychain, since it holds no secret. The refresh token stays in
   * SecureStore; this is just display data.
   */
  async getCachedUser(): Promise<AuthUser | null> {
    try {
      const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  },

  async setCachedUser(user: AuthUser): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } catch {
      /* best effort — the app still works without the cache */
    }
  },

  async clearCachedUser(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHED_USER_KEY);
    } catch {
      /* fine */
    }
  },
};

export const appStorage = AsyncStorage;