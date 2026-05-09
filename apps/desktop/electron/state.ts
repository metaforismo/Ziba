// Per-window mutable state for the Electron main process.
//
// We use module-level vars rather than a class for simplicity: the main
// process owns at most one open vault at a time in v0.1, and IPC handlers
// pull whatever state they need via these getters. If we ever support
// multiple windows / multiple vaults, swap this for a Map keyed by window.

import type { FilesystemAdapter, IndexStoreAdapter, NotePath, WatcherAdapter } from '@ziba/core';
import type { VaultInfo } from '../shared/ipc.js';
import { IpcError } from './security.js';

let currentVault: VaultInfo | null = null;
let indexStore: IndexStoreAdapter | null = null;
let watcher: WatcherAdapter | null = null;
let filesystem: FilesystemAdapter | null = null;

// Paths we just wrote ourselves, with an expiry timestamp. The watcher
// uses this to skip echoes of our own writes (chokidar's awaitWriteFinish
// re-stat happens after we've already updated the editor's mtime, which
// would otherwise look like an external change and clobber the buffer).
const SELF_WRITE_TTL_MS = 2000;
const recentSelfWrites = new Map<NotePath, number>();

export function getCurrentVault(): VaultInfo | null {
  return currentVault;
}

export function setCurrentVault(v: VaultInfo | null): void {
  currentVault = v;
}

export function getIndexStore(): IndexStoreAdapter | null {
  return indexStore;
}

export function setIndexStore(s: IndexStoreAdapter | null): void {
  indexStore = s;
}

export function getWatcher(): WatcherAdapter | null {
  return watcher;
}

export function setWatcher(w: WatcherAdapter | null): void {
  watcher = w;
}

export function getFilesystem(): FilesystemAdapter | null {
  return filesystem;
}

export function setFilesystem(fs: FilesystemAdapter | null): void {
  filesystem = fs;
}

/**
 * Throwing accessors used inside IPC handlers — every handler other than
 * `pickVaultFolder` / `openVault` / `getCurrentVault` / `getRecentVaults`
 * requires an open vault, so this lets us assert that contract once.
 */
export function requireVault(): VaultInfo {
  if (!currentVault) throw new IpcError('NO_VAULT', 'Nessun vault è aperto.');
  return currentVault;
}

export function requireIndexStore(): IndexStoreAdapter {
  if (!indexStore) {
    throw new IpcError('NO_VAULT', 'Index store non inizializzato (vault non aperto).');
  }
  return indexStore;
}

export function requireFilesystem(): FilesystemAdapter {
  if (!filesystem) {
    throw new IpcError('NO_VAULT', 'Filesystem adapter non inizializzato.');
  }
  return filesystem;
}

/**
 * Mark a vault-relative path as something we just wrote ourselves. The
 * watcher's event forwarder consults this map and silently drops events
 * whose path matches within the TTL window.
 */
export function markSelfWrite(path: NotePath): void {
  recentSelfWrites.set(path, Date.now() + SELF_WRITE_TTL_MS);
}

/**
 * Returns true if `path` was self-written within the TTL window. Side
 * effect: clears expired entries lazily.
 */
export function consumeIfSelfWrite(path: NotePath): boolean {
  const expires = recentSelfWrites.get(path);
  if (expires === undefined) return false;
  if (Date.now() > expires) {
    recentSelfWrites.delete(path);
    return false;
  }
  // Don't delete on read — multiple watcher events can fire for one write
  // (e.g. add + change). Let the TTL sweep handle cleanup.
  return true;
}
