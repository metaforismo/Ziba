// SQLite-backed IndexStoreAdapter for the Electron main process.
//
// Title resolution is case-insensitive (Obsidian behavior). We achieve this
// by always querying via LOWER(title) / LOWER(target_title) and creating
// matching indexes; the original casing is preserved in the column for
// display.

import Database from 'better-sqlite3';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  INDEX_DB_FILENAME,
  INDEX_DIR_NAME,
  PRAGMAS,
  SCHEMA_SQL,
  type FullTextHit,
  type IndexStoreAdapter,
  type NotePath,
  type NoteSummary,
  type OutgoingWikilink,
  type TagPair,
  type TagSummaryRow,
  type UpsertNoteInput,
  type WikilinkRow,
} from '@synapsium/core';

/**
 * Strip Obsidian-style heading/block refs from a wikilink target.
 * `[[Foo#Heading]]` and `[[Foo#^abc123]]` both resolve to "Foo" for the
 * purposes of title->path lookup in v0.1.
 */
function stripHeadingRef(target: string): string {
  const hash = target.indexOf('#');
  return hash === -1 ? target : target.slice(0, hash);
}

/**
 * FTS5 query characters that have special meaning. We rewrite raw user
 * input into a safe MATCH expression by:
 *   - rejecting empty input (caller should short-circuit before calling).
 *   - if the user typed boolean operators (AND / OR / NOT) or grouping,
 *     pass it through after escaping internal double-quotes.
 *   - otherwise wrap each whitespace-separated term in double quotes so
 *     punctuation in titles/bodies (e.g. apostrophes) doesn't blow up the
 *     parser.
 */
function escapeFts5Query(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return '';

  // Heuristic: if the user already typed FTS5-style operators or grouping,
  // assume they know what they're doing — only neutralise stray quotes.
  const hasOperators = /\b(AND|OR|NOT)\b|[()"]/.test(trimmed);
  if (hasOperators) {
    // Escape any double-quotes by doubling them (FTS5 syntax for embedded
    // quotes in a phrase). Best-effort: malformed queries still surface as
    // SQLite errors to the caller.
    return trimmed.replace(/"/g, '""');
  }

  // Tokenise on whitespace, drop empty pieces, wrap each token as a phrase.
  // FTS5 phrases use double quotes; we escape any internal `"`.
  return trimmed
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => '"' + t.replace(/"/g, '""') + '"')
    .join(' ');
}

type Row = {
  path: string;
  title: string;
  frontmatter_json: string;
  mtime: number;
};

type WikilinkDbRow = {
  source_path: string;
  target_title: string;
  target_path: string | null;
  source_title?: string;
};

export class SqliteIndexStore implements IndexStoreAdapter {
  private db: Database.Database | null = null;

  // Prepared statements -- created lazily after init().
  private stmts: {
    upsertNote: Database.Statement;
    deleteNote: Database.Statement;
    getNote: Database.Statement;
    listNotes: Database.Statement;
    searchByTitle: Database.Statement;
    deleteWikilinksFor: Database.Statement;
    insertWikilink: Database.Statement;
    getBacklinks: Database.Statement;
    getOutgoing: Database.Statement;
    resolveTitle: Database.Statement;
    clearWikilinks: Database.Statement;
    clearNotes: Database.Statement;
    deleteFts: Database.Statement;
    insertFts: Database.Statement;
    searchFts: Database.Statement;
    deleteTagsFor: Database.Statement;
    insertTag: Database.Statement;
    listTags: Database.Statement;
    getNotesByTag: Database.Statement;
    clearTags: Database.Statement;
    clearFts: Database.Statement;
  } | null = null;

  async init(vaultRoot: string): Promise<void> {
    const dir = path.join(vaultRoot, INDEX_DIR_NAME);
    await fsp.mkdir(dir, { recursive: true });
    const dbPath = path.join(dir, INDEX_DB_FILENAME);

    const db = new Database(dbPath);
    db.exec(PRAGMAS);
    db.exec(SCHEMA_SQL);

    // Augment with case-insensitive lookup indexes. The shared schema can't
    // assume a particular collation, so we add LOWER() expression indexes
    // here -- these are idempotent (CREATE INDEX IF NOT EXISTS).
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_title_lower
        ON notes(LOWER(title));
      CREATE INDEX IF NOT EXISTS idx_wikilinks_target_title_lower
        ON wikilinks(LOWER(target_title));
    `);

    this.db = db;
    this.stmts = {
      upsertNote: db.prepare(`
        INSERT INTO notes (path, title, frontmatter_json, mtime)
        VALUES (@path, @title, @frontmatter_json, @mtime)
        ON CONFLICT(path) DO UPDATE SET
          title            = excluded.title,
          frontmatter_json = excluded.frontmatter_json,
          mtime            = excluded.mtime
      `),
      deleteNote: db.prepare(`DELETE FROM notes WHERE path = ?`),
      getNote: db.prepare(`
        SELECT path, title, mtime FROM notes WHERE path = ?
      `),
      listNotes: db.prepare(`
        SELECT path, title, mtime FROM notes ORDER BY LOWER(title) ASC
      `),
      // Prefix match, case-insensitive. Use LOWER(...) LIKE for index use.
      searchByTitle: db.prepare(`
        SELECT path, title, mtime
        FROM notes
        WHERE LOWER(title) LIKE @prefix ESCAPE '\\'
        ORDER BY LOWER(title) ASC
        LIMIT @limit
      `),
      deleteWikilinksFor: db.prepare(`DELETE FROM wikilinks WHERE source_path = ?`),
      insertWikilink: db.prepare(`
        INSERT OR REPLACE INTO wikilinks (source_path, target_title, target_path)
        VALUES (?, ?, ?)
      `),
      // Join back to notes for source title -- the IPC layer needs it for
      // backlinks UI without an extra round-trip per row.
      getBacklinks: db.prepare(`
        SELECT w.source_path AS source_path,
               w.target_title AS target_title,
               w.target_path  AS target_path,
               n.title        AS source_title
        FROM wikilinks w
        JOIN notes n ON n.path = w.source_path
        WHERE w.target_path = ?
      `),
      getOutgoing: db.prepare(`
        SELECT source_path, target_title, target_path
        FROM wikilinks
        WHERE source_path = ?
      `),
      // "Most canonical" tiebreak: shortest path, then alphabetic.
      resolveTitle: db.prepare(`
        SELECT path FROM notes
        WHERE LOWER(title) = LOWER(?)
        ORDER BY LENGTH(path) ASC, path ASC
        LIMIT 1
      `),
      clearWikilinks: db.prepare(`DELETE FROM wikilinks`),
      clearNotes: db.prepare(`DELETE FROM notes`),
      deleteFts: db.prepare(`DELETE FROM notes_fts WHERE path = ?`),
      // Plain FTS5 table: we delete-then-insert rather than rely on rowid
      // tricks. Slightly more writes, vastly simpler than external-content.
      insertFts: db.prepare(`
        INSERT INTO notes_fts (path, title, body)
        VALUES (?, ?, ?)
      `),
      searchFts: db.prepare(`
        SELECT path,
               title,
               snippet(notes_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet
        FROM notes_fts
        WHERE notes_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      deleteTagsFor: db.prepare(`DELETE FROM tags WHERE source_path = ?`),
      insertTag: db.prepare(`
        INSERT OR REPLACE INTO tags (source_path, tag, display_tag)
        VALUES (?, ?, ?)
      `),
      // MAX(display_tag) is a stable choice when multiple notes spell a tag
      // differently; we just need *some* canonicalised display value.
      listTags: db.prepare(`
        SELECT tag,
               MAX(display_tag) AS display,
               COUNT(*) AS count
        FROM tags
        GROUP BY tag
        ORDER BY count DESC, tag ASC
      `),
      getNotesByTag: db.prepare(`
        SELECT n.path AS path, n.title AS title, n.mtime AS mtime
        FROM tags t
        INNER JOIN notes n ON t.source_path = n.path
        WHERE t.tag = ? COLLATE NOCASE
        ORDER BY n.title COLLATE NOCASE
      `),
      clearTags: db.prepare(`DELETE FROM tags`),
      clearFts: db.prepare(`DELETE FROM notes_fts`),
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.stmts = null;
    }
  }

  private require(): NonNullable<SqliteIndexStore['stmts']> {
    if (!this.stmts || !this.db) throw new Error('IndexStore not initialized');
    return this.stmts;
  }

  async upsertNote(note: UpsertNoteInput): Promise<void> {
    const s = this.require();
    if (!this.db) throw new Error('IndexStore not initialized');
    // Bundle the notes-table upsert and the FTS mirror update so a partial
    // failure can't leave them out of sync.
    const tx = this.db.transaction((n: UpsertNoteInput) => {
      s.upsertNote.run({
        path: n.path,
        title: n.title,
        frontmatter_json: JSON.stringify(n.frontmatter ?? {}),
        mtime: n.mtimeMs,
      });
      // Always refresh the FTS row when a body is supplied. Callers without
      // body in scope simply leave the existing snippet intact (which may
      // become stale until the next full-body upsert / reindex).
      if (n.body !== undefined) {
        s.deleteFts.run(n.path);
        s.insertFts.run(n.path, n.title, n.body);
      }
    });
    tx(note);
    return Promise.resolve();
  }

  async deleteNote(p: NotePath): Promise<void> {
    const s = this.require();
    if (!this.db) throw new Error('IndexStore not initialized');
    // FK with ON DELETE CASCADE wipes wikilinks AND tags rows for us, but we
    // also delete tags explicitly for clarity AND to cover the FTS mirror
    // (which is a virtual table -- no FKs reach it).
    const tx = this.db.transaction((path: NotePath) => {
      s.deleteFts.run(path);
      s.deleteTagsFor.run(path);
      s.deleteNote.run(path);
    });
    tx(p);
    return Promise.resolve();
  }

  async getNote(p: NotePath): Promise<NoteSummary | null> {
    const s = this.require();
    const row = s.getNote.get(p) as Row | undefined;
    if (!row) return null;
    return { path: row.path, title: row.title, mtimeMs: row.mtime };
  }

  async listNotes(): Promise<NoteSummary[]> {
    const s = this.require();
    const rows = s.listNotes.all() as Row[];
    return rows.map((r) => ({ path: r.path, title: r.title, mtimeMs: r.mtime }));
  }

  async searchNotesByTitle(prefix: string, limit: number): Promise<NoteSummary[]> {
    const s = this.require();
    const safe = (limit ?? 20) > 0 ? (limit ?? 20) : 20;
    // Escape LIKE metacharacters so a literal `_` or `%` in a title prefix
    // doesn't act as a wildcard.
    const escaped = prefix.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c);
    const rows = s.searchByTitle.all({
      prefix: escaped + '%',
      limit: safe,
    }) as Row[];
    return rows.map((r) => ({ path: r.path, title: r.title, mtimeMs: r.mtime }));
  }

  async getBacklinks(targetPath: NotePath): Promise<WikilinkRow[]> {
    const s = this.require();
    const rows = s.getBacklinks.all(targetPath) as WikilinkDbRow[];
    return rows.map((r) => ({
      sourcePath: r.source_path,
      targetTitle: r.target_title,
    }));
  }

  /**
   * Same as getBacklinks but returns the source title too -- used by the
   * IPC layer to avoid a second round-trip per backlink. Not part of the
   * core interface (intentionally extra).
   */
  getBacklinksWithSourceTitle(
    targetPath: NotePath,
  ): Array<{ sourcePath: NotePath; targetTitle: string; sourceTitle: string }> {
    const s = this.require();
    const rows = s.getBacklinks.all(targetPath) as WikilinkDbRow[];
    return rows.map((r) => ({
      sourcePath: r.source_path,
      targetTitle: r.target_title,
      sourceTitle: r.source_title ?? r.source_path,
    }));
  }

  async getOutgoingWikilinks(sourcePath: NotePath): Promise<OutgoingWikilink[]> {
    const s = this.require();
    const rows = s.getOutgoing.all(sourcePath) as WikilinkDbRow[];
    return rows.map((r) => ({ targetTitle: r.target_title, targetPath: r.target_path }));
  }

  async replaceWikilinks(sourcePath: NotePath, links: OutgoingWikilink[]): Promise<void> {
    const s = this.require();
    if (!this.db) throw new Error('IndexStore not initialized');
    const tx = this.db.transaction((src: NotePath, ls: OutgoingWikilink[]) => {
      s.deleteWikilinksFor.run(src);
      for (const l of ls) {
        s.insertWikilink.run(src, l.targetTitle, l.targetPath);
      }
    });
    tx(sourcePath, links);
    return Promise.resolve();
  }

  async resolveTitleToPath(title: string): Promise<NotePath | null> {
    const s = this.require();
    // Strip heading/block refs -- `[[Foo#Heading]]` resolves to "Foo".
    const cleaned = stripHeadingRef(title).trim();
    if (cleaned.length === 0) return null;
    const row = s.resolveTitle.get(cleaned) as { path: string } | undefined;
    return row ? row.path : null;
  }

  async searchFullText(query: string, limit: number): Promise<FullTextHit[]> {
    const s = this.require();
    const safeLimit = limit > 0 ? limit : 20;
    const matchExpr = escapeFts5Query(query);
    if (matchExpr.length === 0) return [];
    type FtsRow = { path: string; title: string; snippet: string };
    let rows: FtsRow[];
    try {
      rows = s.searchFts.all(matchExpr, safeLimit) as FtsRow[];
    } catch (err) {
      // Malformed FTS5 expression (e.g. user typed unbalanced quotes after
      // we passed through). Surface as an empty result rather than crash.
      console.warn('[index-store] FTS5 query failed:', err);
      return [];
    }
    return rows.map((r) => ({ path: r.path, title: r.title, snippet: r.snippet }));
  }

  async listTags(): Promise<TagSummaryRow[]> {
    const s = this.require();
    type Row = { tag: string; display: string; count: number };
    const rows = s.listTags.all() as Row[];
    return rows.map((r) => ({ tag: r.tag, display: r.display, count: r.count }));
  }

  async getNotesByTag(canonicalTag: string): Promise<NoteSummary[]> {
    const s = this.require();
    type Row = { path: string; title: string; mtime: number };
    const rows = s.getNotesByTag.all(canonicalTag) as Row[];
    return rows.map((r) => ({ path: r.path, title: r.title, mtimeMs: r.mtime }));
  }

  async replaceTags(sourcePath: NotePath, tags: TagPair[]): Promise<void> {
    const s = this.require();
    if (!this.db) throw new Error('IndexStore not initialized');
    const tx = this.db.transaction((src: NotePath, ts: TagPair[]) => {
      s.deleteTagsFor.run(src);
      for (const t of ts) {
        s.insertTag.run(src, t.canonical, t.display);
      }
    });
    tx(sourcePath, tags);
    return Promise.resolve();
  }

  async clear(): Promise<void> {
    const s = this.require();
    if (!this.db) throw new Error('IndexStore not initialized');
    const tx = this.db.transaction(() => {
      s.clearWikilinks.run();
      s.clearTags.run();
      s.clearFts.run();
      s.clearNotes.run();
    });
    tx();
    return Promise.resolve();
  }
}
