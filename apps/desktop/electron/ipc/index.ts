// Single registration entry point. `main.ts` calls
// `registerIpcHandlers(window)` once after the BrowserWindow is created.
//
// Each handler is wrapped in a typed `handle()` helper that infers the
// request/response types from `IpcRequests` / `IpcResponses` -- this means
// a typo in a channel name or a payload-shape drift fails at compile time.

import { ipcMain, type BrowserWindow } from 'electron';
import {
  IpcChannels,
  type IpcRequests,
  type IpcResponses,
} from '../../shared/ipc.js';
import * as vaultIpc from './vault.js';
import * as notesIpc from './notes.js';
import * as folderIpc from './folder.js';
import * as linksIpc from './links.js';
import * as settingsIpc from './settings.js';

type Handler<C extends keyof IpcRequests> = (
  args: IpcRequests[C],
) => Promise<IpcResponses[C]> | IpcResponses[C];

function handle<C extends keyof IpcRequests>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, async (_event, args: IpcRequests[C]) => {
    return fn(args);
  });
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // Vault lifecycle
  handle(IpcChannels.pickVaultFolder, (args) => vaultIpc.pickVaultFolder(args ?? {}));
  handle(IpcChannels.openVault, (args) => vaultIpc.openVault(win, args));
  handle(IpcChannels.closeVault, () => vaultIpc.closeVault());
  handle(IpcChannels.getCurrentVault, () => vaultIpc.getCurrentVaultHandler());
  handle(IpcChannels.reindexVault, () => vaultIpc.reindexVault());

  // Notes
  handle(IpcChannels.listNotes, () => notesIpc.listNotes());
  handle(IpcChannels.loadNote, (args) => notesIpc.loadNote(args));
  handle(IpcChannels.saveNote, (args) => notesIpc.saveNote(args));
  handle(IpcChannels.createNote, (args) => notesIpc.createNote(args));
  handle(IpcChannels.renameNote, (args) => notesIpc.renameNote(args));
  handle(IpcChannels.deleteNote, (args) => notesIpc.deleteNote(args));
  handle(IpcChannels.searchByTitle, (args) => notesIpc.searchByTitle(args));

  // Folders
  handle(IpcChannels.createFolder, (args) => folderIpc.createFolder(args));
  handle(IpcChannels.renameFolder, (args) => folderIpc.renameFolder(args));
  handle(IpcChannels.deleteFolder, (args) => folderIpc.deleteFolder(args));

  // Links
  handle(IpcChannels.getBacklinks, (args) => linksIpc.getBacklinks(args));
  handle(IpcChannels.resolveTitle, (args) => linksIpc.resolveTitle(args));

  // Settings
  handle(IpcChannels.getRecentVaults, () => settingsIpc.getRecentVaults());
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
