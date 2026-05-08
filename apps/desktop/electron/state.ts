// Per-window mutable state for the Electron main process.
//
// We use module-level vars rather than a class for simplicity: the main
// process owns at most one open vault at a time in v0.1, and IPC handlers
// pull whatever state they need via these getters. If we ever support
// multiple windows / multiple vaults, swap this for a Map keyed by window.

import type { FilesystemAdapter, IndexStoreAdapter, WatcherAdapter } from '@synapsium/core';
import type { VaultInfo } from '../shared/ipc.js';

let currentVault: VaultInfo | null = null;
let indexStore: IndexStoreAdapter | null = null;
let watcher: WatcherAdapter | null = null;
let filesystem: FilesystemAdapter | null = null;

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
  if (!currentVault) throw new Error('No vault is open');
  return currentVault;
}

export function requireIndexStore(): IndexStoreAdapter {
  if (!indexStore) throw new Error('Index store is not initialized');
  return indexStore;
}

export function requireFilesystem(): FilesystemAdapter {
  if (!filesystem) throw new Error('Filesystem adapter is not initialized');
  return filesystem;
}
