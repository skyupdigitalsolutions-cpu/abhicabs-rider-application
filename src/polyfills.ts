/**
 * src/polyfills.ts
 *
 * Hermes (React Native's JS engine) does NOT provide a global `DOMException`.
 * React Native 0.81 uses its own DOMException as an internal module, but some
 * third-party dependencies reference the GLOBAL `DOMException`. On Hermes that
 * throws "ReferenceError: Property 'DOMException' doesn't exist" at load time.
 *
 * This installs a minimal, spec-shaped DOMException on the global object so
 * those dependencies can evaluate. It is a no-op on any runtime that already
 * provides DOMException.
 *
 * IMPORTANT: this file must be imported FIRST in index.ts, before `expo`,
 * `App`, or anything else — so the global exists before any dependency loads.
 */
if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'Error';
    }
  }
  (globalThis as any).DOMException = DOMException;
}

export {};