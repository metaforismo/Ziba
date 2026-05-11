import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import type { ZibaApi } from '../../shared/ipc';

// Vitest setup file — runs once per worker before any test in `src/**`.
//
// Three responsibilities:
//   1. Install a default `window.ziba` so any module that imports
//      `lib/ipc.ts` doesn't crash on load. The default API throws
//      "not mocked" for every channel — tests must opt-in to behaviour
//      via `installMockIpc()` from `./mock-ipc.ts`. This makes accidental
//      reliance on the real IPC surface (which doesn't exist in tests)
//      loud rather than silent.
//   2. Patch `window.localStorage` with a working in-memory shim. Node 22+
//      ships an experimental `localStorage` global that intercepts the
//      one jsdom would normally provide; on misconfigured Node binaries
//      (e.g. Node 25 without `--localstorage-file`) this surfaces as a
//      plain `{}` with no `clear`/`getItem`/`setItem` methods, which
//      breaks the UI-store hydration tests. We unconditionally override
//      with our own shim — same shape as DOM Storage, fully in-memory.
//   3. Reset shared global state between tests so order doesn't matter.

function makeFailingApi(): ZibaApi {
  const fail = (channel: string): never => {
    throw new Error(`window.ziba.${channel} not mocked. Call installMockIpc() in your test.`);
  };
  return {
    invoke: ((channel: string) => fail(`invoke('${channel}')`)) as ZibaApi['invoke'],
    onVaultEvent: () => fail('onVaultEvent'),
    onIndexProgress: () => fail('onIndexProgress'),
  };
}

/**
 * Minimal in-memory Storage implementation. Mirrors the Web Storage API
 * surface our UI store relies on (`getItem`, `setItem`, `removeItem`,
 * `clear`, `length`, `key`). Unlike the real Storage, all values are
 * coerced via `String(...)` so callers see the spec-correct round-trip.
 */
function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      map.set(String(key), String(value));
    },
    removeItem(key: string): void {
      map.delete(String(key));
    },
    key(index: number): string | null {
      const keys = Array.from(map.keys());
      return keys[index] ?? null;
    },
  };
  return storage;
}

function installLocalStorage(): void {
  // Override on `window` even if it already exists — Node's experimental
  // global is a non-spec stub and breaks on the first .clear() call.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: false,
    value: makeMemoryStorage(),
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    writable: false,
    value: makeMemoryStorage(),
  });
}

// Install the default API. Tests replace it via `installMockIpc()`,
// but if a test forgets, calls fail loudly instead of cryptically.
window.ziba = makeFailingApi();
installLocalStorage();

afterEach(() => {
  // Unmount all React trees rendered in the current test so portals
  // mounted to document.body don't leak into subsequent tests.
  // `@testing-library/react` normally auto-cleans via a global afterEach,
  // but `globals: false` in vitest means that hook never runs.
  cleanup();
  // Clear localStorage so the UI store can re-hydrate cleanly between
  // tests. The shim from `installLocalStorage()` exposes a real `clear`.
  window.localStorage.clear();
  // Restore the failing default so a later test can't accidentally
  // observe behaviour from an earlier test's mock controller.
  window.ziba = makeFailingApi();
  // Reset all vi.fn / vi.spyOn instances so call counts don't leak.
  vi.restoreAllMocks();
  // Switch back to real timers — fake timers leak between tests
  // otherwise and cause confusing "test never finished" hangs.
  vi.useRealTimers();
});
