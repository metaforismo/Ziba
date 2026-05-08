// IPC contract between Electron main process and React renderer.
// Imported by both `electron/` (handlers) and `src/` (client).
// Keep this file framework-agnostic: only types + channel name constants.

import type { Note, NoteSummary, NotePath, Frontmatter } from '@synapsium/core';

export const IpcChannels = {
  // Vault lifecycle
  pickVaultFolder: 'vault:pickFolder',
  openVault: 'vault:open',
  closeVault: 'vault:close',
  getCurrentVault: 'vault:current',
  reindexVault: 'vault:reindex',

  // Note operations
  listNotes: 'notes:list',
  loadNote: 'notes:load',
  saveNote: 'notes:save',
  createNote: 'notes:create',
  renameNote: 'notes:rename',
  deleteNote: 'notes:delete',
  searchByTitle: 'notes:searchByTitle',

  // Folder operations
  createFolder: 'folder:create',
  renameFolder: 'folder:rename',
  deleteFolder: 'folder:delete',

  // Wikilinks / backlinks
  getBacklinks: 'links:backlinks',
  resolveTitle: 'links:resolveTitle',

  // Settings / persisted state
  getRecentVaults: 'settings:recentVaults',

  // Watcher push events (main → renderer)
  vaultEvent: 'watcher:event',
  indexProgress: 'index:progress',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

// ---- Request / response payloads ----

export type VaultInfo = {
  root: string;
  name: string;
  openedAt: number;
};

export type IpcRequests = {
  [IpcChannels.pickVaultFolder]: { defaultPath?: string };
  [IpcChannels.openVault]: { root: string };
  [IpcChannels.closeVault]: void;
  [IpcChannels.getCurrentVault]: void;
  [IpcChannels.reindexVault]: void;

  [IpcChannels.listNotes]: void;
  [IpcChannels.loadNote]: { path: NotePath };
  [IpcChannels.saveNote]: { path: NotePath; body: string; frontmatter: Frontmatter };
  [IpcChannels.createNote]: { path: NotePath; initialBody?: string };
  [IpcChannels.renameNote]: { from: NotePath; to: NotePath };
  [IpcChannels.deleteNote]: { path: NotePath };
  [IpcChannels.searchByTitle]: { prefix: string; limit?: number };

  [IpcChannels.createFolder]: { path: NotePath };
  [IpcChannels.renameFolder]: { from: NotePath; to: NotePath };
  [IpcChannels.deleteFolder]: { path: NotePath };

  [IpcChannels.getBacklinks]: { path: NotePath };
  [IpcChannels.resolveTitle]: { title: string };

  [IpcChannels.getRecentVaults]: void;
};

export type Backlink = {
  sourcePath: NotePath;
  sourceTitle: string;
  context?: string; // short snippet around the wikilink occurrence
};

export type IpcResponses = {
  [IpcChannels.pickVaultFolder]: { root: string } | null; // null = user cancelled
  [IpcChannels.openVault]: VaultInfo;
  [IpcChannels.closeVault]: void;
  [IpcChannels.getCurrentVault]: VaultInfo | null;
  [IpcChannels.reindexVault]: { count: number };

  [IpcChannels.listNotes]: NoteSummary[];
  [IpcChannels.loadNote]: Note;
  [IpcChannels.saveNote]: { mtimeMs: number };
  [IpcChannels.createNote]: Note;
  [IpcChannels.renameNote]: { newPath: NotePath };
  [IpcChannels.deleteNote]: void;
  [IpcChannels.searchByTitle]: NoteSummary[];

  [IpcChannels.createFolder]: void;
  [IpcChannels.renameFolder]: void;
  [IpcChannels.deleteFolder]: void;

  [IpcChannels.getBacklinks]: Backlink[];
  [IpcChannels.resolveTitle]: NotePath | null;

  [IpcChannels.getRecentVaults]: VaultInfo[];
};

// ---- Push events (main → renderer, no response) ----

export type VaultEventPayload =
  | { type: 'add' | 'change'; path: NotePath; mtimeMs: number }
  | { type: 'unlink'; path: NotePath }
  | { type: 'addDir' | 'unlinkDir'; path: NotePath };

export type IndexProgressPayload = { processed: number; total: number | null };

// ---- API surface exposed via contextBridge to window.synapsium ----

export interface SynapsiumApi {
  invoke<C extends keyof IpcRequests>(
    channel: C,
    ...args: IpcRequests[C] extends void ? [] : [IpcRequests[C]]
  ): Promise<IpcResponses[C]>;

  onVaultEvent(listener: (payload: VaultEventPayload) => void): () => void;
  onIndexProgress(listener: (payload: IndexProgressPayload) => void): () => void;
}

declare global {
  interface Window {
    synapsium: SynapsiumApi;
  }
}
