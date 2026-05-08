/**
 * Filename of the SQLite cache inside `<vaultRoot>/.synapsium/`.
 * Adapters concatenate this with `INDEX_DIR_NAME` to build the full path.
 */
export const INDEX_DB_FILENAME = 'index.db';

/**
 * Hidden subdirectory inside the vault that holds synapsium-managed files
 * (currently just the SQLite index; future: cached embeddings, settings).
 * Anything under this folder is skipped during vault scans.
 */
export const INDEX_DIR_NAME = '.synapsium';

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
`.trim();
