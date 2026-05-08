// Thin typed wrapper over `window.synapsium.invoke`. The raw API uses
// channel-string tuples; these named methods make call-sites readable and
// keep the IPC contract enforced by the shared types.

import type { Frontmatter, Note, NotePath, NoteSummary } from '@synapsium/core';
import type {
  Backlink,
  IndexProgressPayload,
  VaultEventPayload,
  VaultInfo,
} from '../../shared/ipc';
import { IpcChannels } from '../../shared/ipc';

function api(): Window['synapsium'] {
  // The preload script must have populated this before the React tree
  // mounts. If it hasn't, every IPC call would crash with a confusing
  // "cannot read properties of undefined" — fail fast and loudly instead.
  if (typeof window === 'undefined' || !window.synapsium) {
    throw new Error(
      'window.synapsium is not available. Preload script did not run.',
    );
  }
  return window.synapsium;
}

export const ipc = {
  // Vault lifecycle
  pickVaultFolder(args: { defaultPath?: string } = {}): Promise<{ root: string } | null> {
    return api().invoke(IpcChannels.pickVaultFolder, args);
  },
  openVault(args: { root: string }): Promise<VaultInfo> {
    return api().invoke(IpcChannels.openVault, args);
  },
  closeVault(): Promise<void> {
    return api().invoke(IpcChannels.closeVault);
  },
  getCurrentVault(): Promise<VaultInfo | null> {
    return api().invoke(IpcChannels.getCurrentVault);
  },
  reindexVault(): Promise<{ count: number }> {
    return api().invoke(IpcChannels.reindexVault);
  },

  // Notes
  listNotes(): Promise<NoteSummary[]> {
    return api().invoke(IpcChannels.listNotes);
  },
  loadNote(args: { path: NotePath }): Promise<Note> {
    return api().invoke(IpcChannels.loadNote, args);
  },
  saveNote(args: {
    path: NotePath;
    body: string;
    frontmatter: Frontmatter;
  }): Promise<{ mtimeMs: number }> {
    return api().invoke(IpcChannels.saveNote, args);
  },
  createNote(args: { path: NotePath; initialBody?: string }): Promise<Note> {
    return api().invoke(IpcChannels.createNote, args);
  },
  renameNote(args: { from: NotePath; to: NotePath }): Promise<{ newPath: NotePath }> {
    return api().invoke(IpcChannels.renameNote, args);
  },
  deleteNote(args: { path: NotePath }): Promise<void> {
    return api().invoke(IpcChannels.deleteNote, args);
  },
  searchByTitle(args: { prefix: string; limit?: number }): Promise<NoteSummary[]> {
    return api().invoke(IpcChannels.searchByTitle, args);
  },

  // Folders
  createFolder(args: { path: NotePath }): Promise<void> {
    return api().invoke(IpcChannels.createFolder, args);
  },
  renameFolder(args: { from: NotePath; to: NotePath }): Promise<void> {
    return api().invoke(IpcChannels.renameFolder, args);
  },
  deleteFolder(args: { path: NotePath }): Promise<void> {
    return api().invoke(IpcChannels.deleteFolder, args);
  },

  // Links
  getBacklinks(args: { path: NotePath }): Promise<Backlink[]> {
    return api().invoke(IpcChannels.getBacklinks, args);
  },
  resolveTitle(args: { title: string }): Promise<NotePath | null> {
    return api().invoke(IpcChannels.resolveTitle, args);
  },

  // Settings
  getRecentVaults(): Promise<VaultInfo[]> {
    return api().invoke(IpcChannels.getRecentVaults);
  },

  // Push subscriptions — return an unsubscribe function.
  onVaultEvent(listener: (payload: VaultEventPayload) => void): () => void {
    return api().onVaultEvent(listener);
  },
  onIndexProgress(listener: (payload: IndexProgressPayload) => void): () => void {
    return api().onIndexProgress(listener);
  },
};

export type Ipc = typeof ipc;
