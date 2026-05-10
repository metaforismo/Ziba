import type { Note, NotePath, NoteSummary } from '../types/note.js';
import type { DatabaseQuery, DatabaseResult, DetectedProperty, FullGraph } from '../query/index.js';
import type { RelationEntry } from '../markdown/relations.js';
import type { ObjectTypeSchema } from '../types/schema.js';

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
 * v1.0: row form of a typed relation as stored in SQLite. The
 * indexer's `RelationEntry` extracts kind+title from frontmatter+body;
 * the caller then resolves `targetPath` (against `notes`) and persists
 * via `replaceRelations`.
 */
export type ResolvedRelation = {
  /** `''` for generic body wikilinks, otherwise the relation kind. */
  kind: string;
  targetTitle: string;
  /** null = unresolved / broken link. */
  targetPath: NotePath | null;
};

/** Read shape returned by getRelations / getReverseRelations. */
export type RelationRow = {
  sourcePath: NotePath;
  kind: string;
  targetTitle: string;
  targetPath: NotePath | null;
};

/** v1.0: row form of a cached object-type schema. */
export type ObjectTypeRow = {
  id: string;
  label: string;
  icon: string | null;
  color: string | null;
  schema: ObjectTypeSchema;
  mtimeMs: number;
};

/**
 * v1.0: aggregated count of notes per `type:` slug. Drives the
 * sidebar TypesSection. Includes ONLY types that appear in at least
 * one note's frontmatter — types declared in `.ziba/schema/` but
 * never used are absent (matches the Tag-counts behaviour).
 */
export type TypeCountRow = {
  type: string;
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

  /**
   * v1.0: replace all relations originating from `sourcePath`. The
   * caller is responsible for resolving each `targetTitle` →
   * `targetPath` against the current vault before passing them in
   * (mirroring the existing `replaceWikilinks` flow). `kind = ''` is
   * the sentinel for generic body wikilinks.
   */
  replaceRelations(sourcePath: NotePath, relations: ResolvedRelation[]): Promise<void>;

  /** v1.0: list all relations originating from `sourcePath`. */
  getRelations(args: { sourcePath: NotePath; kind?: string }): Promise<RelationRow[]>;

  /**
   * v1.0: list all relations pointing AT `targetPath`. Used by the
   * object panel to drive both the inverse-relation view and the
   * kind-grouped backlinks panel.
   */
  getReverseRelations(args: { targetPath: NotePath; kind?: string }): Promise<RelationRow[]>;

  /** v1.0: every cached object type, sorted by id. */
  listObjectTypes(): Promise<ObjectTypeRow[]>;

  /**
   * v1.0: aggregated count of notes per `type:` slug. Sorted by
   * descending count, then ascending type for tiebreak (mirrors
   * `listTags`).
   */
  getTypeCounts(): Promise<TypeCountRow[]>;

  /**
   * v1.0: all notes carrying a `type:` slug, returned as a path → type
   * map. Reads from `note_properties` so the cost is one indexed scan
   * on `prop_key = 'type'`. Untyped notes are absent from the map.
   *
   * The renderer keeps this map for the editor's wikilink decoration
   * (per-link `path → type → icon` lookup) and refreshes on vault /
   * schema events. Bounded cost: typed notes are a fraction of total
   * notes for realistic vaults.
   */
  getTypedPaths(): Promise<Map<NotePath, string>>;

  /** v1.0: insert or replace a type's cached schema. */
  upsertObjectType(row: ObjectTypeRow): Promise<void>;

  /** v1.0: drop a type from the cache. No-op if not present. */
  deleteObjectType(id: string): Promise<void>;

  clear(): Promise<void>;
}

// Re-export the entry shape so callers can import it from this module.
export type { RelationEntry };
