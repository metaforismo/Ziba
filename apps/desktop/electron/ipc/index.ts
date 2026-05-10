// Single registration entry point. `main.ts` calls
// `registerIpcHandlers(window)` once after the BrowserWindow is created.
//
// Each handler is wrapped in a typed `handle()` helper that:
//   1. Infers the request/response types from `IpcRequests`/`IpcResponses`,
//      so a typo in a channel name or a payload-shape drift fails to
//      compile.
//   2. Catches every error, logs it to the main process, and rejects the
//      renderer with a sanitised `{ code, message }` shape — never the raw
//      stack trace or absolute paths.

import { ipcMain, type BrowserWindow } from 'electron';
import { IpcChannels, type IpcRequests, type IpcResponses } from '../../shared/ipc.js';
import { toSerializedError, type IpcErrorCode } from '../security.js';
import {
  pickVaultFolder,
  openVault,
  closeVault,
  getCurrentVaultHandler,
  reindexVault,
} from './vault.js';
import {
  listNotes,
  loadNote,
  saveNote,
  createNote,
  renameNote,
  deleteNote,
  searchByTitle,
} from './notes.js';
import { createFolder, renameFolder, deleteFolder } from './folder.js';
import { getBacklinks, resolveTitle } from './links.js';
import { searchFullText } from './search.js';
import { listTags, getNotesByTag } from './tags.js';
import { runDatabaseQuery } from './database.js';
import { getFullGraph } from './graph.js';
import {
  listObjectTypes,
  upsertObjectType,
  deleteObjectType,
  getRelationsBySource,
  getRelationsByTarget,
} from './types.js';
import { getRecentVaults } from './settings.js';

type Handler<C extends keyof IpcRequests> = (
  args: IpcRequests[C],
) => Promise<IpcResponses[C]> | IpcResponses[C];

/**
 * Wire one IPC channel to a handler. The wrapper translates any thrown
 * error to a sanitised payload before it crosses the IPC boundary — the
 * full error (with stack and OS paths) stays in the main-process console.
 */
function handle<C extends keyof IpcRequests>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, async (_event, args: IpcRequests[C]) => {
    try {
      return await fn(args);
    } catch (err: unknown) {
      const serialized = toSerializedError(err);
      // Re-throw an Error: Electron sends `name`/`message`/`stack` plus
      // own enumerable properties to the renderer. We belt-and-brace by
      // both attaching `code` and prefixing the message with `[CODE]`,
      // so the renderer can extract the code reliably even if a future
      // Electron version tightens its structured-clone policy. See
      // `extractIpcErrorCode` in `src/lib/ipc-error.ts`.
      const safeErr = new Error(`[${serialized.code}] ${serialized.message}`) as Error & {
        code: IpcErrorCode;
      };
      safeErr.code = serialized.code;
      throw safeErr;
    }
  });
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Vault lifecycle
  handle(IpcChannels.pickVaultFolder, (args) => pickVaultFolder(args ?? {}));
  handle(IpcChannels.openVault, (args) => openVault(win, args));
  handle(IpcChannels.closeVault, () => closeVault());
  handle(IpcChannels.getCurrentVault, () => getCurrentVaultHandler());
  handle(IpcChannels.reindexVault, () => reindexVault());

  // Notes
  handle(IpcChannels.listNotes, () => listNotes());
  handle(IpcChannels.loadNote, (args) => loadNote(args));
  handle(IpcChannels.saveNote, (args) => saveNote(args));
  handle(IpcChannels.createNote, (args) => createNote(args));
  handle(IpcChannels.renameNote, (args) => renameNote(args));
  handle(IpcChannels.deleteNote, (args) => deleteNote(args));
  handle(IpcChannels.searchByTitle, (args) => searchByTitle(args));

  // Folders
  handle(IpcChannels.createFolder, (args) => createFolder(args));
  handle(IpcChannels.renameFolder, (args) => renameFolder(args));
  handle(IpcChannels.deleteFolder, (args) => deleteFolder(args));

  // Links
  handle(IpcChannels.getBacklinks, (args) => getBacklinks(args));
  handle(IpcChannels.resolveTitle, (args) => resolveTitle(args));

  // Search / tags
  handle(IpcChannels.searchFullText, (args) => searchFullText(args));
  handle(IpcChannels.listTags, () => listTags());
  handle(IpcChannels.getNotesByTag, (args) => getNotesByTag(args));

  // Database queries / global graph (v0.3 Wave 1)
  handle(IpcChannels.runDatabaseQuery, (args) => runDatabaseQuery(args));
  handle(IpcChannels.getFullGraph, () => getFullGraph());

  // v1.0: typed object types + typed relations
  handle(IpcChannels.listObjectTypes, () => listObjectTypes());
  handle(IpcChannels.upsertObjectType, (args) => upsertObjectType(args));
  handle(IpcChannels.deleteObjectType, (args) => deleteObjectType(args));
  handle(IpcChannels.getRelationsBySource, (args) => getRelationsBySource(args));
  handle(IpcChannels.getRelationsByTarget, (args) => getRelationsByTarget(args));

  // Settings
  handle(IpcChannels.getRecentVaults, () => getRecentVaults());
}

/**
 * Strip every handler we registered. Called from `main.ts` on window
 * close so a re-opened window can re-register cleanly.
 */
export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(IpcChannels)) {
    ipcMain.removeHandler(channel);
  }
}
