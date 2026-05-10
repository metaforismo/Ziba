// Vault lifecycle handlers: pick / open / close / current / reindex.
//
// `openVault` is the heavy one -- it wires up every per-vault adapter,
// triggers the initial index, and starts the file watcher pushing events
// to the renderer over IPC.

import { dialog, BrowserWindow } from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { indexVault } from '@ziba/core';
import { IpcChannels, type VaultInfo } from '../../shared/ipc.js';
import { getFilesystemAdapter } from '../adapters/filesystem.electron.js';
import { SqliteIndexStore } from '../adapters/index-store.sqlite.js';
import { ChokidarWatcher } from '../adapters/watcher.chokidar.js';
import { bootstrapSchemas, watchSchemas } from '../schema-loader.js';
import { IpcError } from '../security.js';
import {
  consumeIfSelfWrite,
  getCurrentVault,
  getIndexStore,
  getSchemaWatcher,
  getWatcher,
  requireIndexStore,
  setCurrentVault,
  setFilesystem,
  setIndexStore,
  setSchemaWatcher,
  setWatcher,
} from '../state.js';
import { pushRecentVault } from './settings.js';

export async function pickVaultFolder(args: {
  defaultPath?: string;
}): Promise<{ root: string } | null> {
  const win = BrowserWindow.getFocusedWindow();
  const opts: Electron.OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
  };
  if (args?.defaultPath) opts.defaultPath = args.defaultPath;

  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);

  if (result.canceled || result.filePaths.length === 0) return null;
  return { root: result.filePaths[0]! };
}

/**
 * Tear down whatever vault is currently open. Safe to call when nothing is
 * open. Used both by `closeVault` and as a cleanup step inside `openVault`
 * (so we never leak the previous vault's watcher / DB handle).
 */
async function teardown(): Promise<void> {
  const w = getWatcher();
  if (w) {
    try {
      await w.stop();
    } catch {
      // Best effort -- a watcher that fails to stop shouldn't block reopen.
    }
    setWatcher(null);
  }
  const sw = getSchemaWatcher();
  if (sw) {
    try {
      await sw.stop();
    } catch {
      // Best effort.
    }
    setSchemaWatcher(null);
  }
  const s = getIndexStore();
  if (s) {
    try {
      await s.close();
    } catch {
      // ditto
    }
    setIndexStore(null);
  }
  setCurrentVault(null);
  // Filesystem adapter is a singleton; we only need to reset its vaultRoot
  // pointer so its `readDir` doesn't continue resolving against the old
  // root if the next open happens to reuse it.
  const fs = getFilesystemAdapter();
  fs.setVaultRoot(null);
  setFilesystem(fs);
}

export async function openVault(win: BrowserWindow, args: { root: string }): Promise<VaultInfo> {
  // Always start clean. If the renderer calls openVault while one is
  // already open, we treat that as "switch vault".
  await teardown();

  const root = path.resolve(args.root);

  // Defence in depth: confirm the chosen path is a directory and not a
  // filesystem root (`/`, `C:\`). The Electron dialog should already
  // enforce both, but a malicious renderer could call openVault directly.
  const stat = await fsp.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new IpcError('NOT_FOUND', 'La cartella scelta non esiste o non è una directory.');
  }
  const parsed = path.parse(root);
  if (parsed.dir === '' && parsed.base === '') {
    throw new IpcError('INVALID_PATH', 'Non si può usare la radice del filesystem come vault.');
  }

  const fs = getFilesystemAdapter();
  fs.setVaultRoot(root);
  setFilesystem(fs);

  const indexStore = new SqliteIndexStore();
  await indexStore.init(root);
  setIndexStore(indexStore);

  // v1.0: bootstrap object-type schemas. Copies the seven seed YAMLs
  // into `<root>/.ziba/schema/` if the dir is empty, then parses every
  // `.yml` and syncs the result into the `object_types` cache.
  // Errors in individual schemas are logged and skipped — one bad
  // file shouldn't block opening the vault.
  await bootstrapSchemas(root, indexStore);

  // v1.0.1: hot-reload schemas. Editing `.ziba/schema/<id>.yml` while
  // the vault is open propagates to the SQLite cache and pushes a
  // `schemasChanged` event so the renderer refreshes its taxonomy
  // without a vault re-open.
  const schemaW = watchSchemas(root, indexStore, () => {
    if (win.isDestroyed()) return;
    win.webContents.send(IpcChannels.vaultEvent, { type: 'schemasChanged' });
  });
  setSchemaWatcher(schemaW);

  // Initial index. Push progress to the renderer so the UI can show a
  // spinner / progress bar while large vaults import.
  await indexVault(fs, indexStore, root, (processed) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.indexProgress, {
        processed,
        total: null,
      });
    }
  });

  // Now spin up the watcher. We attach it AFTER the initial scan so we
  // don't race with `indexVault` writing to the same DB. Watcher events
  // for paths we just wrote ourselves are suppressed — chokidar's
  // awaitWriteFinish re-stat fires *after* `saveNote` has already updated
  // the editor's mtime, which would otherwise look like an external edit.
  const watcher = new ChokidarWatcher();
  await watcher.start(root, (event) => {
    if (win.isDestroyed()) return;
    if (
      (event.type === 'add' || event.type === 'change' || event.type === 'unlink') &&
      consumeIfSelfWrite(event.path)
    ) {
      return;
    }
    win.webContents.send(IpcChannels.vaultEvent, event);
  });
  setWatcher(watcher);

  const info: VaultInfo = {
    root,
    name: path.basename(root) || root,
    openedAt: Date.now(),
  };
  setCurrentVault(info);
  await pushRecentVault(info);

  return info;
}

export async function closeVault(): Promise<void> {
  await teardown();
}

export async function getCurrentVaultHandler(): Promise<VaultInfo | null> {
  return getCurrentVault();
}

export async function reindexVault(): Promise<{ count: number }> {
  const vault = getCurrentVault();
  if (!vault) throw new IpcError('NO_VAULT', 'Nessun vault è aperto.');
  const store = requireIndexStore();
  const fs = getFilesystemAdapter();

  fs.setVaultRoot(vault.root);
  const result = await indexVault(fs, store, vault.root);
  return { count: result.count };
}

/**
 * Public for `main.ts` to call on window close.
 */
export async function teardownVault(): Promise<void> {
  await teardown();
}
