/**
 * src/store/session.ts
 *
 * The single source of truth for "who is logged in". It owns:
 *
 *   - the ACCESS token, in memory only (never persisted — see storage.ts)
 *   - the REFRESH token, mirrored to secure storage so a cold start can restore
 *     the session without asking the user to log in again
 *   - the current user
 *   - a `status` the navigation tree switches on: 'loading' | 'authed' | 'guest'
 *
 * It also injects the session hooks into the API client, which is what lets the
 * client refresh tokens without importing this store (avoiding a cycle).
 *
 * The access token is deliberately NOT part of the reactive state that screens
 * subscribe to — it changes on every refresh, and re-rendering the app tree on
 * each token rotation would be wasteful. It lives in a module ref that the
 * client reads synchronously; only `user` and `status` are reactive.
 */

import { create } from 'zustand';
import { secureStore } from '../lib/storage';
import { configureClient } from '../api/client';
import { authApi } from '../api/endpoints';
import { AbhiApiError } from '../types/api';
import type { AuthResult, AuthUser } from '../types/domain';

type SessionStatus = 'loading' | 'authed' | 'guest';

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;

  /** Restore a session from the secure refresh token on app launch. */
  bootstrap: () => Promise<void>;
  /** Persist a successful auth result and flip to 'authed'. */
  signIn: (result: AuthResult) => Promise<void>;
  /** Clear everything and flip to 'guest'. Optionally tell the server to revoke. */
  signOut: (opts?: { revokeOnServer?: boolean }) => Promise<void>;
}

/**
 * Non-reactive token holder. Read synchronously by the client on every request;
 * written by refresh/sign-in. Keeping it out of Zustand state avoids re-rendering
 * on token rotation.
 */
let accessTokenRef: string | null = null;

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,

  async bootstrap() {
    const refreshToken = await secureStore.getRefreshToken();
    if (!refreshToken) {
      accessTokenRef = null;
      set({ status: 'guest', user: null });
      return;
    }

    // We have a refresh token but no access token (cold start). Mint one, and
    // fetch the user. The client's refresh path will rotate + persist for us.
    try {
      // A cheap authed call triggers the client's transparent refresh: there is
      // no access token yet, so /auth/me 401s, the client refreshes using the
      // stored refresh token, persists the rotated pair, and replays /auth/me.
      const { user } = await authApi.me();
      set({ status: 'authed', user });
    } catch (err) {
      // Refresh token is expired/invalid/reused — start clean.
      if (err instanceof AbhiApiError && err.isFatalAuth) {
        await secureStore.clearRefreshToken();
      }
      accessTokenRef = null;
      set({ status: 'guest', user: null });
    }
  },

  async signIn(result) {
    accessTokenRef = result.accessToken;
    await secureStore.setRefreshToken(result.refreshToken);
    set({ status: 'authed', user: result.user });
  },

  async signOut(opts) {
    const refreshToken = await secureStore.getRefreshToken();
    if (opts?.revokeOnServer && refreshToken) {
      // Best effort; logout is idempotent server-side and must not block the UI.
      authApi.logout(refreshToken).catch(() => {});
    }
    accessTokenRef = null;
    await secureStore.clearRefreshToken();
    set({ status: 'guest', user: null });
  },
}));

/**
 * Wire the API client to this store ONCE, at app startup (before bootstrap()).
 * These closures are how the transport layer reads/writes tokens without a
 * circular import.
 */
export function initSessionBridge(): void {
  configureClient({
    getAccessToken: () => accessTokenRef,
    getRefreshToken: () => secureStore.getRefreshToken(),
    onTokensRefreshed: async (accessToken, refreshToken) => {
      accessTokenRef = accessToken;
      await secureStore.setRefreshToken(refreshToken);
    },
    onSessionInvalid: async () => {
      accessTokenRef = null;
      await secureStore.clearRefreshToken();
      // Flip the tree to the auth stack. Safe to call from anywhere.
      useSession.setState({ status: 'guest', user: null });
    },
  });
}

/** For the socket manager, which needs the current token to authenticate. */
export const getAccessTokenSnapshot = (): string | null => accessTokenRef;