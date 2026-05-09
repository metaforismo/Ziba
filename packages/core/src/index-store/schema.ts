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

CREATE TABLE IF NOT EXISTS wikilinks (
  source_path  TEXT NOT NULL,
  target_title TEXT NOT NULL,
  target_path  TEXT,
  PRIMARY KEY (source_path, target_title),
  FOREIGN KEY (source_path) REFERENCES notes(path) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wikilinks_target_title ON wikilinks(target_title);
CREATE INDEX IF NOT EXISTS idx_wikilinks_target_path  ON wikilinks(target_path);
CREATE INDEX IF NOT EXISTS idx_notes_title            ON notes(title);

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
`.trim();
