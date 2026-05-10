// IPC contract between Electron main process and React renderer.
// Imported by both `electron/` (handlers) and `src/` (client).
// Keep this file framework-agnostic: only types + channel name constants.

import type {
  DatabaseGroup,
  DatabaseQuery,
  DatabaseResult,
  DatabaseRow,
  DetectedProperty,
  Frontmatter,
  FullGraph,
  GraphEdge,
  GraphNode,
  Note,
  NotePath,
  NoteSummary,
  ObjectTypeRow,
  PropertyType,
  RelationRow,
  ScalarFilter,
  TypeCountRow,
} from '@ziba/core';

// Re-export the v0.3 query / graph types + v1.0 object/relation types
// so renderers can keep a single import surface (`'@shared/ipc'`) for
// everything they touch via IPC.
export type {
  DatabaseGroup,
  DatabaseQuery,
  DatabaseResult,
  DatabaseRow,
  DetectedProperty,
  FullGraph,
  GraphEdge,
  GraphNode,
  ObjectTypeRow,
  PropertyType,
  RelationRow,
  ScalarFilter,
  TypeCountRow,
};

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

  // Search / tags
  searchFullText: 'search:fullText',
  listTags: 'tags:list',
  getNotesByTag: 'tags:notesByTag',

  // Database queries (v0.3 Wave 1)
  runDatabaseQuery: 'db:query',
  // Full graph (v0.3 Wave 1, used by Wave 2's global graph view)
  getFullGraph: 'graph:full',

  // v1.0: typed object types + typed relations
  listObjectTypes: 'types:list',
  upsertObjectType: 'types:upsert',
  deleteObjectType: 'types:delete',
  getTypeCounts: 'types:counts',
  getRelationsBySource: 'relations:bySource',
  getRelationsByTarget: 'relations:byTarget',

  // Settings / persisted state
  getRecentVaults: 'settings:recentVaults',

  // Watcher push events (main → renderer)
  vaultEvent: 'watcher:event',
  indexProgress: 'index:progress',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * Canonical error codes attached to every rejection that crosses the
 * IPC boundary. Defined here (not in `electron/security.ts`) because
 * the renderer needs the type to branch on `extractIpcErrorCode(err)`.
 *
 * The const-as-keys table is the single source of truth: both
 * `IpcErrorCode` (the type) and `IPC_ERROR_CODES` (the runtime set
 * the renderer uses to validate inbound codes) are derived from it,
 * so adding a new code is a one-line change. Without this trick the
 * type and the validation set drift independently — adding a code
 * to the union but forgetting to update the set silently treats the
 * new code as "no code" in the renderer.
 *
 * When you add a code here, also update `toSerializedError` in
 * `electron/security.ts` (translates Node.js errno-style codes into
 * the canonical names) so the wrapper actually emits it.
 */
const IPC_ERROR_CODE_TABLE = {
  NO_VAULT: true,
  NOT_FOUND: true,
  ALREADY_EXISTS: true,
  INVALID_PATH: true,
  INVALID_QUERY: true,
  PERMISSION_DENIED: true,
  INTERNAL: true,
} as const;

export type IpcErrorCode = keyof typeof IPC_ERROR_CODE_TABLE;

export const IPC_ERROR_CODES: ReadonlySet<IpcErrorCode> = new Set(
  Object.keys(IPC_ERROR_CODE_TABLE) as IpcErrorCode[],
);

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

  [IpcChannels.searchFullText]: { query: string; limit?: number };
  [IpcChannels.listTags]: void;
  [IpcChannels.getNotesByTag]: { tag: string };

  [IpcChannels.runDatabaseQuery]: { query: DatabaseQuery };
  [IpcChannels.getFullGraph]: void;

  // v1.0
  [IpcChannels.listObjectTypes]: void;
  [IpcChannels.upsertObjectType]: { row: ObjectTypeRow };
  [IpcChannels.deleteObjectType]: { id: string };
  [IpcChannels.getTypeCounts]: void;
  [IpcChannels.getRelationsBySource]: { sourcePath: NotePath; kind?: string };
  [IpcChannels.getRelationsByTarget]: { targetPath: NotePath; kind?: string };

  [IpcChannels.getRecentVaults]: void;
};

export type Backlink = {
  sourcePath: NotePath;
  sourceTitle: string;
  context?: string; // short snippet around the wikilink occurrence
};

/** A single full-text-search hit returned to the renderer. */
export type SearchHit = {
  path: NotePath;
  title: string;
  /** FTS5 snippet with `<mark>` highlight markers around matched terms. */
  snippet: string;
};

/** Aggregated tag listing entry. */
export type TagSummary = {
  /** Canonical lowercase tag. */
  tag: string;
  /** Display-case form for UI. */
  display: string;
  count: number;
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

  [IpcChannels.searchFullText]: SearchHit[];
  [IpcChannels.listTags]: TagSummary[];
  [IpcChannels.getNotesByTag]: NoteSummary[];

  [IpcChannels.runDatabaseQuery]: DatabaseResult;
  [IpcChannels.getFullGraph]: FullGraph;

  // v1.0
  [IpcChannels.listObjectTypes]: ObjectTypeRow[];
  [IpcChannels.upsertObjectType]: void;
  [IpcChannels.deleteObjectType]: void;
  [IpcChannels.getTypeCounts]: TypeCountRow[];
  [IpcChannels.getRelationsBySource]: RelationRow[];
  [IpcChannels.getRelationsByTarget]: RelationRow[];

  [IpcChannels.getRecentVaults]: VaultInfo[];
};

// ---- Push events (main → renderer, no response) ----

export type VaultEventPayload =
  | { type: 'add' | 'change'; path: NotePath; mtimeMs: number }
  | { type: 'unlink'; path: NotePath }
  | { type: 'addDir' | 'unlinkDir'; path: NotePath };

export type IndexProgressPayload = { processed: number; total: number | null };

// ---- API surface exposed via contextBridge to window.ziba ----

export interface ZibaApi {
  invoke<C extends keyof IpcRequests>(
    channel: C,
    ...args: IpcRequests[C] extends void ? [] : [IpcRequests[C]]
  ): Promise<IpcResponses[C]>;

  onVaultEvent(listener: (payload: VaultEventPayload) => void): () => void;
  onIndexProgress(listener: (payload: IndexProgressPayload) => void): () => void;
}

declare global {
  interface Window {
    ziba: ZibaApi;
  }
}
