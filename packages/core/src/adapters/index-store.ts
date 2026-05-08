import type { Note, NotePath, NoteSummary } from '../types/note.js';

export type WikilinkRow = {
  sourcePath: NotePath;
  targetTitle: string;
};

export type OutgoingWikilink = {
  targetTitle: string;
  /** null when the target title doesn't resolve to any known note (broken link). */
  targetPath: NotePath | null;
};

/**
 * Cache of parsed vault metadata. Backed by SQLite in the desktop app;
 * any backend (in-memory, IndexedDB) that fulfils these methods works.
 *
 * Source of truth is the filesystem — this store is rebuildable.
 * `init` is idempotent: it should create tables/indexes if missing.
 */
export interface IndexStoreAdapter {
  init(vaultRoot: string): Promise<void>;
  close(): Promise<void>;

  upsertNote(note: Omit<Note, 'content'>): Promise<void>;
  deleteNote(path: NotePath): Promise<void>;
  getNote(path: NotePath): Promise<NoteSummary | null>;
  listNotes(): Promise<NoteSummary[]>;

  /** Title-prefix search; case-insensitive recommended. */
  searchNotesByTitle(prefix: string, limit: number): Promise<NoteSummary[]>;

  /** Notes that link TO `targetPath`, with the title used in the wikilink. */
  getBacklinks(targetPath: NotePath): Promise<WikilinkRow[]>;

  getOutgoingWikilinks(sourcePath: NotePath): Promise<OutgoingWikilink[]>;

  /** Atomically replace all wikilinks for a single source note. */
  replaceWikilinks(sourcePath: NotePath, links: OutgoingWikilink[]): Promise<void>;

  resolveTitleToPath(title: string): Promise<NotePath | null>;

  clear(): Promise<void>;
}
