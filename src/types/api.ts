/**
 * src/types/api.ts
 *
 * The wire contract with the AbhiCabs backend. Every response follows one
 * envelope; every error carries a machine-readable `code`. Mirroring these as
 * types means a screen that handles `OUTSIDE_SERVICE_AREA` is checked at compile
 * time against the set of codes the backend can actually send.
 *
 * Source of truth: backend docs/API.md ("Standard response envelope" +
 * "Common error codes") and the per-endpoint error lists.
 */

/** Success envelope. `data` is the payload; `message` is optional human text. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

/** Error envelope. `code` is stable and safe to branch on; `message` is for humans. */
export interface ApiFailure {
  success: false;
  error: {
    code: ApiErrorCode | string; // string fallback: never crash on an unknown code
    message: string;
    fields?: Record<string, string>; // present on VALIDATION_ERROR
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/**
 * Every error code the backend documents. Kept as a union so `switch` blocks can
 * be exhaustive and a typo in a code string is a compile error, not a silent
 * mishandled case at runtime.
 */
export type ApiErrorCode =
  // transport / generic
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_BUSY' // 503, load shedding — carries Retry-After
  // auth
  | 'AUTH_REQUIRED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_INACTIVE'
  | 'EMAIL_TAKEN'
  | 'INVALID_OTP'
  | 'REFRESH_EXPIRED'
  | 'INVALID_REFRESH'
  | 'TOKEN_REUSED' // family revoked server-side — must force a full logout
  // idempotency
  | 'IDEMPOTENCY_KEY_REUSED'
  // fares / booking
  | 'OUTSIDE_SERVICE_AREA'
  | 'CITY_NOT_SERVICED'
  | 'FARE_CONFIG_MISSING'
  | 'NO_FARE_CONFIG'
  | 'BAD_COORDINATES'
  | 'INVALID_STATUS_TRANSITION'
  | 'CREDIT_LIMIT_EXCEEDED'
  // payments
  | 'BOOKING_NOT_PAYABLE'
  | 'DUPLICATE_ACTIVE_ORDER';

/**
 * The single Error type the whole app throws for a failed request. Screens catch
 * this, read `.code`, and decide what to show. `status` is the HTTP status;
 * `retryAfterMs` is populated for 429/503 so callers can show a countdown.
 */
export class AbhiApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterMs?: number;

  constructor(params: {
    code: ApiErrorCode | string;
    message: string;
    status: number;
    fields?: Record<string, string>;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = 'AbhiApiError';
    this.code = params.code;
    this.status = params.status;
    this.fields = params.fields;
    this.retryAfterMs = params.retryAfterMs;
    // Restore prototype chain for `instanceof` after transpilation to ES5-ish.
    Object.setPrototypeOf(this, AbhiApiError.prototype);
  }

  /** Network/timeout failures (no HTTP response at all) use status 0. */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** Server told us it is overloaded or we are rate-limited; a backoff retry is appropriate. */
  get isRetryable(): boolean {
    return this.status === 503 || this.status === 429 || this.isNetwork;
  }

  /** The session is unrecoverable and the user must be logged out. */
  get isFatalAuth(): boolean {
    return (
      this.code === 'TOKEN_REUSED' ||
      this.code === 'REFRESH_EXPIRED' ||
      this.code === 'INVALID_REFRESH' ||
      this.code === 'ACCOUNT_INACTIVE'
    );
  }
}