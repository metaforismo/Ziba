import type { Note, NotePath, NoteSummary } from '../types/note.js';
import type { DatabaseQuery, DatabaseResult, DetectedProperty, FullGraph } from '../query/index.js';

export type WikilinkRow = {
  sourcePath: NotePath;
  targetTitle: string;
};

export type OutgoingWikilink = {
  targetTitle: string;
  /** null when the target title doesn't resolve to any known note (broken link). */
  targetPath: NotePath | null;
};

/** Canonical (lowercase) + display-case tag pair stored per (note, tag). */
export type TagPair = {
  canonical: string;
  display: string;
};

/** Hit returned by a full-text search query. */
export type FullTextHit = {
  path: NotePath;
  title: string;
  /** FTS5 snippet() output — body excerpt with highlight markers. */
  snippet: string;
};

/** Aggregated tag listing with usage count. */
export type TagSummaryRow = {
  /** Canonical lowercase tag. */
  tag: string;
  /** Display-case form (one of the canonicalised display values). */
  display: string;
  count: number;
};

/**
 * Variant of the upsert payload that can additionally carry the body so the
 * SQLite adapter can keep the FTS5 mirror in sync. Body is optional to keep
 * existing call-sites compiling while we roll out FTS coverage.
 */
export type UpsertNoteInput = Omit<Note, 'content'> & { body?: string };

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

  /**
   * Upsert a note row. Callers SHOULD pass `body` so the FTS5 mirror stays
   * in sync — otherwise full-text search will return stale snippets for
   * that note. The field is optional to avoid breaking existing call-sites
   * that don't yet have the body in scope.
   */
  upsertNote(note: UpsertNoteInput): Promise<void>;
  deleteNote(path: NotePath): Promise<void>;
  getNote(path: NotePath): Promise<NoteSummary | null>;
  listNotes(): Promise<NoteSummary[]>;

  /** Title-prefix search; case-insensitive recommended. */
  searchNotesByTitle(prefix: string, limit: number): Promise<NoteSummary[]>;

  /**
   * Full-text search. `query` follows FTS5 query syntax (boolean ops like
   * `foo OR bar`, exact phrases via `"..."`, `-` for negation). Adapters
   * are responsible for sanitising raw user input. Returns notes ordered by
   * FTS5 rank, capped at `limit`.
   */
  searchFullText(query: string, limit: number): Promise<FullTextHit[]>;

  /** Distinct tags with their usage counts, ordered by count desc then tag asc. */
  listTags(): Promise<TagSummaryRow[]>;

  /** Notes carrying `canonicalTag` (case-insensitive match). */
  getNotesByTag(canonicalTag: string): Promise<NoteSummary[]>;

  /** Atomically replace all tags for a single source note. */
  replaceTags(sourcePath: NotePath, tags: TagPair[]): Promise<void>;

  /** Notes that link TO `targetPath`, with the title used in the wikilink. */
  getBacklinks(targetPath: NotePath): Promise<WikilinkRow[]>;

  getOutgoingWikilinks(sourcePath: NotePath): Promise<OutgoingWikilink[]>;

  /** Atomically replace all wikilinks for a single source note. */
  replaceWikilinks(sourcePath: NotePath, links: OutgoingWikilink[]): Promise<void>;

  /**
   * After a note is renamed, every wikilink whose `target_path` was the
   * old path is stale. This method finds those rows and re-resolves each
   * by its `target_title` — the result may point at the new path (title
   * unchanged), at a different note (title now ambiguous and another note
   * matches first), or `null` (title now broken). Call after `rename` to
   * keep `getBacklinks` / `getFullGraph` correct.
   */
  reresolveStaleWikilinks(formerlyResolvingTo: NotePath): Promise<void>;

  resolveTitleToPath(title: string): Promise<NotePath | null>;

  /**
   * Replace all property rows for `sourcePath` with the given list.
   * Called from the indexer after each `upsertNote`. Empty list clears
   * the note's property rows.
   */
  replaceProperties(sourcePath: NotePath, props: DetectedProperty[]): Promise<void>;

  /**
   * Run a typed query against `note_properties`, joined back to `notes`
   * for path/title/mtime. Implementations clamp the limit and N+1 the
   * per-row property fetch — fine for v0.3 vault sizes.
   */
  runQuery(query: DatabaseQuery): Promise<DatabaseResult>;

  /**
   * Return all notes + all RESOLVED outgoing wikilinks as a graph.
   * Broken edges (target_path IS NULL) are excluded — useless for the
   * global graph rendering. Powers v0.3 Wave 2 global graph view.
   */
  getFullGraph(): Promise<FullGraph>;

  clear(): Promise<void>;
}
