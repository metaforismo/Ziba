/**
 * Filename of the SQLite cache inside `<vaultRoot>/.ziba/`.
 * Adapters concatenate this with `INDEX_DIR_NAME` to build the full path.
 */
export const INDEX_DB_FILENAME = 'index.db';

/**
 * Hidden subdirectory inside the vault that holds ziba-managed files
 * (currently just the SQLite index; future: cached embeddings, settings).
 * Anything under this folder is skipped during vault scans.
 */
export const INDEX_DIR_NAME = '.ziba';

/**
 * Pragmas applied at connection time. WAL journaling lets the renderer
 * read while the main process writes; foreign_keys enforces our wikilinks
 * → notes integrity.
 */
export const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`.trim();

/**
 * v0.1 schema. Plain SQL so this file stays free of any DB driver
 * dependency — the desktop app's IndexStoreAdapter implementation imports
 * it and runs it through better-sqlite3.
 *
 * `notes.frontmatter_json` stores the parsed frontmatter as JSON for now;
 * structured property columns and full-text search arrive in later waves.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
  path             TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  mtime            INTEGER NOT NULL
);

-- v1.0: replaces \`wikilinks\`. The legacy table is dropped on first
-- open of a v1.0 vault (see MIGRATION_DROP_SQL below) — index is a
-- cache, no data loss.
--
-- \`kind\` is NOT NULL with a sentinel empty string for generic body
-- wikilinks. SQLite PRIMARY KEY requires column references (not
-- expressions), so we encode "untyped" as '' rather than NULL.
CREATE TABLE IF NOT EXISTS relations (
  source_path  TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT '',
  target_title TEXT NOT NULL,
  target_path  TEXT,
  PRIMARY KEY (source_path, kind, target_title),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relations_target_title ON relations(target_title);
CREATE INDEX IF NOT EXISTS idx_relations_target_path  ON relations(target_path, kind);
CREATE INDEX IF NOT EXISTS idx_relations_kind         ON relations(kind) WHERE kind <> '';
CREATE INDEX IF NOT EXISTS idx_notes_title            ON notes(title);

-- v1.0: schema cache mirroring \`<vault>/.ziba/schema/*.yml\`. Loaded on
-- vault open; consumed by sidebar TypesSection counts and editor
-- autocomplete.
CREATE TABLE IF NOT EXISTS object_types (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  schema_json TEXT NOT NULL,
  mtime       INTEGER NOT NULL
);

-- Full-text search via FTS5 virtual table. Mirrors \`notes.path\`/\`title\`/\`body\`
-- so wildcards like \`ziba\` or \`architecture OR design\` work.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  path UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Tags. We store one row per (note, tag) pair. Tags come from two sources:
-- (1) \`#tag\` occurrences in the markdown body (extracted by a parser),
-- (2) frontmatter \`tags: [array]\`. Both feed in via the upsert path.
CREATE TABLE IF NOT EXISTS tags (
  source_path TEXT NOT NULL,
  tag TEXT NOT NULL,                  -- canonical lowercase form
  display_tag TEXT NOT NULL,          -- preserved-case form for UI
  PRIMARY KEY (source_path, tag),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- v0.3 Wave 1: typed extraction of frontmatter properties for fast querying.
-- One row per (note, key) pair. Type is detected at index time using the
-- same rules as the renderer-side PropertyEditor (text/number/boolean/date/
-- url/string-array). Multiple typed columns coexist; only the one matching
-- \`prop_type\` is meaningful for any given row.
--
-- Note for upgrades from v0.2: \`IF NOT EXISTS\` means existing vaults pick
-- up this table empty on first open. The next save (or a manual reindex via
-- the existing \`vault:reindex\` IPC) will populate it. Until that happens,
-- database queries against an upgraded vault will return zero rows.
CREATE TABLE IF NOT EXISTS note_properties (
  source_path TEXT NOT NULL,
  prop_key TEXT NOT NULL,
  prop_type TEXT NOT NULL,
  text_value TEXT,
  number_value REAL,
  boolean_value INTEGER,
  date_value TEXT,
  array_value TEXT,                   -- JSON-encoded string[] for multi-select
  PRIMARY KEY (source_path, prop_key),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_props_key    ON note_properties(prop_key);
CREATE INDEX IF NOT EXISTS idx_note_props_text   ON note_properties(prop_key, text_value);
CREATE INDEX IF NOT EXISTS idx_note_props_number ON note_properties(prop_key, number_value);
CREATE INDEX IF NOT EXISTS idx_note_props_date   ON note_properties(prop_key, date_value);

-- AI semantic search (milestone 1). One embedding vector per note.
-- \`content_hash\` + \`model_id\` let the indexer skip a note whose body and
-- embedding model are both unchanged. \`vector\` is a Float32 little-endian
-- BLOB (see \`float32ToBlob\` in core/ai). This table is additive — a new
-- table needs no \`user_version\` bump (IF NOT EXISTS handles fresh + upgraded
-- vaults). The data is a pure cache: deleting it just forces a re-embed.
--
-- No FK to \`notes\`: embeddings are written by an async background pass that
-- can lag the notes upsert, and we don't want a missing-parent race to throw.
-- The pipeline deletes the embedding explicitly on note delete instead.
CREATE TABLE IF NOT EXISTS note_embeddings (
  source_path  TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  dim          INTEGER NOT NULL,
  vector       BLOB NOT NULL,
  mtime        INTEGER NOT NULL
);
`.trim();

/**
 * Cache schema version. Bumping this triggers a one-shot drop+recreate
 * of every cache-only table on next vault open, followed by an
 * automatic full reindex (the index is derivable from disk).
 *
 * Bump rules:
 *   - Adding a new column to an existing table → bump.
 *   - Renaming a table → bump.
 *   - Adding a new table only → no bump needed (`IF NOT EXISTS`
 *     handles it).
 *
 * History:
 *   v0.1 — v0.5: implicit version 1 (no `user_version` set).
 *   v1.0 phase 1: bumps to 2 (introduces `relations`, drops legacy
 *   `wikilinks`, introduces `object_types`).
 */
export const EXPECTED_USER_VERSION = 2;

/**
 * SQL run when `user_version` is below `EXPECTED_USER_VERSION`. Drops
 * tables that changed shape AND every cache-only table — the latter
 * because reindex is cheap and we'd rather rebuild than maintain
 * piecemeal migrations. `notes`, `note_properties`, `tags`, `notes_fts`
 * are also cache so they get rebuilt on the next reindex; dropping
 * them here keeps the schema fresh.
 *
 * Run order matters: drop first, then `SCHEMA_SQL` recreates everything,
 * then `PRAGMA user_version = N` lands the version.
 */
export const MIGRATION_DROP_SQL = `
DROP TABLE IF EXISTS wikilinks;
DROP TABLE IF EXISTS relations;
DROP TABLE IF EXISTS object_types;
DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS note_properties;
DROP TABLE IF EXISTS note_embeddings;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS notes;
`.trim();
