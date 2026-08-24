/**
 * src/api/client.ts
 *
 * The one HTTP client the whole app uses. It is small on purpose, but it solves
 * four backend-specific problems that a naive fetch wrapper gets wrong:
 *
 *   1. SINGLE-FLIGHT REFRESH  (the important one)
 *      The backend rotates the refresh token on every use and REVOKES THE WHOLE
 *      TOKEN FAMILY if it ever sees a rotated token replayed (TOKEN_REUSED). A
 *      15-minute access token expires while several requests are in flight, so
 *      they all 401 at once. If each fired its own /auth/refresh, they would
 *      race, the second would replay the just-rotated token, the backend would
 *      flag reuse, and the user would be logged out. So refresh is single-flight:
 *      the first 401 starts ONE refresh, every other waiting request awaits the
 *      same promise, then all replay with the new access token.
 *
 *   2. RETRY-AFTER / LOAD SHEDDING
 *      The backend sheds load with 503 SERVER_BUSY (+ Retry-After) and rate-limits
 *      with 429. We retry those a bounded number of times with jittered backoff,
 *      honoring Retry-After — never a tight retry loop that makes overload worse.
 *
 *   3. IDEMPOTENCY
 *      Mutations pass an Idempotency-Key, reused across this client's internal
 *      retries so a retried write is deduped server-side.
 *
 *   4. UNIFORM ERRORS
 *      Every failure becomes one AbhiApiError with a stable `.code`, so screens
 *      branch on codes, not HTTP status guesswork.
 *
 * The client is transport only. It knows nothing about React. Session plumbing
 * (where tokens come from, what to do on fatal auth failure) is injected once at
 * startup via `configureClient`, which keeps this file free of import cycles with
 * the store.
 */

import { env } from '../config/env';
import { AbhiApiError, type ApiEnvelope } from '../types/api';

/* ------------------------------- Session hooks ----------------------------- */

/**
 * The client cannot import the session store directly (cycle: store -> client ->
 * store). Instead the store injects these accessors once at boot.
 */
interface SessionHooks {
  /** Current in-memory access token, or null if none. */
  getAccessToken: () => string | null;
  /** Current refresh token from secure storage, or null. */
  getRefreshToken: () => Promise<string | null>;
  /** Persist a freshly rotated token pair. */
  onTokensRefreshed: (accessToken: string, refreshToken: string) => Promise<void>;
  /** Session is unrecoverable (reuse detected / refresh expired). Force logout. */
  onSessionInvalid: () => Promise<void>;
}

let hooks: SessionHooks | null = null;

export function configureClient(h: SessionHooks): void {
  hooks = h;
}

/* --------------------------------- Options --------------------------------- */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  /** JSON body; serialized automatically. */
  body?: unknown;
  /** Query params; undefined/null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send Idempotency-Key (mint once per logical mutation, reuse on retry). */
  idempotencyKey?: string;
  /** Skip the Authorization header (used by the auth endpoints themselves). */
  auth?: boolean;
  /** Per-call timeout override. */
  timeoutMs?: number;
  /** AbortSignal from the caller (e.g. React Query cancellation). */
  signal?: AbortSignal;
  /** Internal: disable the retry loop (used by the refresh call itself). */
  _noRetry?: boolean;
  /** Internal: prevents infinite 401 -> refresh -> 401 recursion. */
  _isRetryAfterRefresh?: boolean;
}

/* ------------------------------- Refresh queue ----------------------------- */

/**
 * The single in-flight refresh. All 401s that arrive while a refresh is running
 * await this exact promise instead of starting their own.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!hooks) throw new Error('[client] configureClient was never called');

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await hooks!.getRefreshToken();
    if (!refreshToken) {
      await hooks!.onSessionInvalid();
      throw new AbhiApiError({
        code: 'INVALID_REFRESH',
        message: 'No refresh token available',
        status: 401,
      });
    }

    // Use the raw request path with retry OFF: refreshing must not itself trip
    // the refresh logic, and a rotated token must never be sent twice.
    try {
      const data = await rawRequest<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh',
        {
          method: 'POST',
          body: { refreshToken },
          auth: false,
          _noRetry: true,
        },
      );
      await hooks!.onTokensRefreshed(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch (err) {
      // Reuse detected, refresh expired, or invalid — the session is dead.
      if (err instanceof AbhiApiError && err.isFatalAuth) {
        await hooks!.onSessionInvalid();
      }
      throw err;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    // Clear the slot regardless of outcome so a later expiry can refresh again.
    refreshInFlight = null;
  }
}

/* --------------------------------- Helpers --------------------------------- */

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = `${env.apiUrl}${env.apiPrefix}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('Retry-After');
  if (!header) return undefined;
  // Retry-After is either delta-seconds or an HTTP-date. Handle both.
  const asNumber = Number(header);
  if (!Number.isNaN(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

function backoffDelay(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  // Exponential with full jitter, capped.
  const exp = Math.min(env.retry.baseDelayMs * 2 ** attempt, env.retry.maxDelayMs);
  return Math.random() * exp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ The raw request ---------------------------- */

/**
 * A single HTTP attempt: builds the request, sends it, and normalizes the
 * response (or a thrown network error) into either `data` or an AbhiApiError.
 * No retry, no refresh — those are layered on top in `request`.
 */
async function rawRequest<T>(path: string, opts: RequestOptions): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    idempotencyKey,
    auth = true,
    timeoutMs = env.requestTimeoutMs,
    signal,
  } = opts;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (auth) {
    const token = hooks?.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Combine the caller's signal with our own timeout signal.
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const onCallerAbort = () => timeoutController.abort();
  if (signal) {
    if (signal.aborted) timeoutController.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeoutController.signal,
    });
  } catch (e) {
    // Network down, DNS failure, timeout, or caller cancellation.
    const aborted = (e as Error)?.name === 'AbortError';
    throw new AbhiApiError({
      code: aborted ? 'INTERNAL_ERROR' : 'INTERNAL_ERROR',
      message: aborted ? 'Request timed out' : 'Network request failed',
      status: 0, // 0 == no HTTP response; AbhiApiError.isNetwork uses this
    });
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onCallerAbort);
  }

  // Parse the envelope. A non-JSON body (e.g. an upstream 502 HTML page) still
  // becomes a clean AbhiApiError rather than a JSON.parse crash.
  let envelope: ApiEnvelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      envelope = null;
    }
  }

  if (res.ok && envelope && envelope.success) {
    return envelope.data;
  }

  // Build a typed error from the envelope when possible, else from the status.
  const retryAfterMs = parseRetryAfterMs(res);
  if (envelope && !envelope.success) {
    throw new AbhiApiError({
      code: envelope.error.code,
      message: envelope.error.message,
      status: res.status,
      fields: envelope.error.fields,
      retryAfterMs,
    });
  }
  throw new AbhiApiError({
    code: res.status === 503 ? 'SERVER_BUSY' : res.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
    message: `Request failed (${res.status})`,
    status: res.status,
    retryAfterMs,
  });
}

/* ------------------------------ Public request ----------------------------- */

/**
 * The function the rest of the app calls. Wraps rawRequest with:
 *   - transparent single-flight token refresh on 401 TOKEN_EXPIRED
 *   - bounded, backed-off retry on 429 / 503 / network
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const maxAttempts = opts._noRetry ? 1 : env.retry.maxAttempts;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await rawRequest<T>(path, opts);
    } catch (err) {
      if (!(err instanceof AbhiApiError)) throw err;

      // --- 401: try exactly one transparent refresh, then replay once ---
      const isExpired =
        err.status === 401 &&
        (err.code === 'TOKEN_EXPIRED' || err.code === 'AUTH_REQUIRED' || err.code === 'INVALID_TOKEN');

      if (isExpired && opts.auth !== false && !opts._isRetryAfterRefresh) {
        try {
          await refreshAccessToken(); // single-flight; waiters share it
        } catch {
          throw err; // refresh failed -> surface the original 401 (session cleared)
        }
        // Replay ONCE with the new token; guard against a second refresh loop.
        return rawRequest<T>(path, { ...opts, _isRetryAfterRefresh: true });
      }

      // --- 429 / 503 / network: bounded backoff retry ---
      attempt += 1;
      if (err.isRetryable && attempt < maxAttempts && !opts._noRetry) {
        await sleep(backoffDelay(attempt, err.retryAfterMs));
        continue;
      }

      throw err;
    }
  }
}

/* --------------------------- Typed method sugar ---------------------------- */

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};