// Coordinates the one-time copy of the build CLI workspace out of the read-only,
// ACL-protected Windows MSIX package dir into a writable per-user location
// (see electron/main.mjs). The copy is deferred until after the window is shown so
// startup stays fast; the build pipeline awaits `whenCliReady()` so a build started
// before staging finishes simply waits instead of failing.
//
// This module intentionally has no Electron dependency: it is imported by both the
// Electron main process (which drives the copy and forwards progress to the renderer)
// and the in-process build pipeline (which only needs the readiness gate).

let readyPromise = Promise.resolve();
let resolveReady = null;
let currentState = { phase: "ready" };
const listeners = new Set();

/** Begin a staging pass: builds block on `whenCliReady()` until completion/failure. */
export function beginCliStaging() {
  readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });
  setStagingState({ phase: "preparing", copied: 0, total: 0 });
}

export function completeCliStaging() {
  setStagingState({ phase: "ready" });
  resolveReady?.();
  resolveReady = null;
}

/**
 * Mark staging failed. Builds are released rather than blocked forever: a build run
 * will then attempt to use whatever is present and surface the real error in its log.
 */
export function failCliStaging(message) {
  setStagingState({ phase: "error", message });
  resolveReady?.();
  resolveReady = null;
}

/** Resolves once staging has completed (or failed). No-op on platforms that never stage. */
export function whenCliReady() {
  return readyPromise;
}

export function setStagingState(state) {
  currentState = state;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch {
      // A misbehaving listener must not break staging progress for the others.
    }
  }
}

export function getStagingState() {
  return currentState;
}

/** Subscribe to staging-state changes. Returns an unsubscribe function. */
export function onCliStaging(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
