/**
 * src/store/session.ts
 *
 * The single source of truth for "who is logged in". It owns:
 *
 *   - the ACCESS token, in memory only (never persisted — see storage.ts)
 *   - the REFRESH token, mirrored to secure storage so a cold start can restore
 *     the session without asking the user to log in again
 *   - a cached snapshot of the last known user (persisted), so a cold start can
 *     render the authed UI INSTANTLY without waiting on a network round-trip
 *   - the current user
 *   - a `status` the navigation tree switches on: 'loading' | 'authed' | 'guest'
 *
 * It also injects the session hooks into the API client, which is what lets the
 * client refresh tokens without importing this store (avoiding a cycle).
 *
 * COLD-START NOTE: bootstrap() is optimistic. If a refresh token exists we flip
 * straight to 'authed' using the cached user (or a placeholder) and verify with
 * /auth/me in the BACKGROUND. Only a fatal auth error drops us to 'guest'. This
 * removes the me() round-trip from the launch critical path — the app paints the
 * home screen immediately instead of showing a spinner until the network answers.
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

    // OPTIMISTIC: we have a refresh token, so assume authed and render now.
    // Use the last cached user if we have one, so the UI is personalized
    // immediately; otherwise a minimal placeholder until me() returns.
    const cachedUser = await secureStore.getCachedUser().catch(() => null);
    set({ status: 'authed', user: cachedUser ?? null });

    // Verify in the BACKGROUND. The client's transparent refresh mints an access
    // token from the stored refresh token, replays me(), and persists the
    // rotated pair. On success we refresh the cached user; on a FATAL auth error
    // (expired/invalid/reused refresh token) we drop to guest.
    try {
      const { user } = await authApi.me();
      await secureStore.setCachedUser(user).catch(() => {});
      set({ status: 'authed', user });
    } catch (err) {
      if (err instanceof AbhiApiError && err.isFatalAuth) {
        accessTokenRef = null;
        await secureStore.clearRefreshToken();
        await secureStore.clearCachedUser().catch(() => {});
        set({ status: 'guest', user: null });
      }
      // Non-fatal (offline, 5xx): stay optimistically authed on the cached user.
      // The next authed request will re-verify. We do NOT log the user out for
      // a transient network problem — that would be a hostile cold-start.
    }
  },

  async signIn(result) {
    accessTokenRef = result.accessToken;
    await secureStore.setRefreshToken(result.refreshToken);
    await secureStore.setCachedUser(result.user).catch(() => {});
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
    await secureStore.clearCachedUser().catch(() => {});
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
      // A real access token now exists. Point the realtime socket at it and
      // (re)connect — this covers the cold-start case where the socket couldn't
      // authenticate yet, and any later token rotation. Dynamically imported so
      // socket.io stays off the cold-start bundle path.
      import('../realtime/socket')
        .then(({ syncSocketAuth }) => syncSocketAuth())
        .catch(() => {});
    },
    onSessionInvalid: async () => {
      accessTokenRef = null;
      await secureStore.clearRefreshToken();
      await secureStore.clearCachedUser().catch(() => {});
      // Flip the tree to the auth stack. Safe to call from anywhere.
      useSession.setState({ status: 'guest', user: null });
    },
  });
}

/** For the socket manager, which needs the current token to authenticate. */
export const getAccessTokenSnapshot = (): string | null => accessTokenRef;