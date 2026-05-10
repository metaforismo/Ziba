import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { EXPECTED_USER_VERSION, MIGRATION_DROP_SQL, PRAGMAS, SCHEMA_SQL } from '@ziba/core';

// Adapter integration tests use an in-memory SQLite so we exercise the
// real prepared statements (and catch SQL syntax mistakes) without
// touching the filesystem. The tests intentionally don't import the
// SqliteIndexStore class — that one ties to Electron's app paths;
// instead we recreate the same statements here and verify the SQL
// shapes round-trip.

let db: Database.Database;

function setupNote(path: string, title = path.replace(/\.md$/, '')): void {
  db.prepare(
    `INSERT INTO notes (path, title, frontmatter_json, mtime)
     VALUES (?, ?, '{}', 0)
     ON CONFLICT (path) DO NOTHING`,
  ).run(path, title);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(PRAGMAS);
  db.exec(SCHEMA_SQL);
  db.exec(`PRAGMA user_version = ${EXPECTED_USER_VERSION}`);
});

afterEach(() => {
  db.close();
});

describe('relations table — round-trip', () => {
  it('inserts a typed relation and reads it back via target', () => {
    setupNote('src/a.md');
    setupNote('src/people/tolkien.md');
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, ?, ?, ?)`,
    ).run('src/a.md', 'author', 'Tolkien', 'src/people/tolkien.md');

    const rows = db
      .prepare(
        `SELECT source_path, kind, target_title, target_path
         FROM relations WHERE target_path = ?`,
      )
      .all('src/people/tolkien.md');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_path: 'src/a.md',
      kind: 'author',
      target_title: 'Tolkien',
      target_path: 'src/people/tolkien.md',
    });
  });

  it("uses '' as the sentinel for generic body wikilinks", () => {
    setupNote('src/a.md');
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, ?, ?, ?)`,
    ).run('src/a.md', '', 'Foo', null);

    const rows = db
      .prepare(`SELECT * FROM relations WHERE source_path = ? AND kind = ''`)
      .all('src/a.md');

    expect(rows).toHaveLength(1);
  });

  it('replace by source_path works (delete + insert in tx)', () => {
    setupNote('src/a.md');
    const tx = db.transaction((src: string) => {
      db.prepare(`DELETE FROM relations WHERE source_path = ?`).run(src);
      db.prepare(
        `INSERT INTO relations (source_path, kind, target_title, target_path)
         VALUES (?, ?, ?, ?)`,
      ).run(src, 'author', 'New', null);
    });

    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, ?, ?, ?)`,
    ).run('src/a.md', 'author', 'Old', null);

    tx('src/a.md');

    const rows = db
      .prepare(`SELECT target_title FROM relations WHERE source_path = ?`)
      .all('src/a.md');

    expect(rows).toHaveLength(1);
    expect((rows[0] as { target_title: string }).target_title).toBe('New');
  });

  it('PRIMARY KEY (source_path, kind, target_title) prevents duplicates', () => {
    setupNote('a');
    const stmt = db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, ?, ?, ?)`,
    );
    stmt.run('a', 'author', 'Foo', null);
    expect(() => stmt.run('a', 'author', 'Foo', null)).toThrow(/UNIQUE/);
    // Same (source, target) but different kind = different row.
    expect(() => stmt.run('a', 'translator', 'Foo', null)).not.toThrow();
  });

  it('migration drops legacy wikilinks and recreates relations', () => {
    db.close();
    db = new Database(':memory:');
    db.exec(PRAGMAS);
    db.exec(`
      CREATE TABLE wikilinks (
        source_path TEXT, target_title TEXT, target_path TEXT,
        PRIMARY KEY (source_path, target_title)
      );
      INSERT INTO wikilinks VALUES ('a.md', 'Old', 'b.md');
      PRAGMA user_version = 1;
    `);

    db.exec(MIGRATION_DROP_SQL);
    db.exec(SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${EXPECTED_USER_VERSION}`);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string;
    }[];
    expect(tables.map((t) => t.name)).not.toContain('wikilinks');
    expect(tables.map((t) => t.name)).toContain('relations');
    const rels = db.prepare(`SELECT COUNT(*) AS c FROM relations`).get() as { c: number };
    expect(rels.c).toBe(0);
  });
});

describe('object_types table — round-trip', () => {
  it('upsert + list returns ordered rows', () => {
    const upsert = db.prepare(`
      INSERT INTO object_types (id, label, icon, color, schema_json, mtime)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET label = excluded.label
    `);
    upsert.run('book', 'Libro', '📖', '#6366f1', '{}', 1);
    upsert.run('person', 'Persona', '👤', '#f97316', '{}', 2);

    const rows = db.prepare(`SELECT id FROM object_types ORDER BY id`).all() as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(['book', 'person']);

    upsert.run('book', 'Libri', '📚', '#000000', '{}', 3);
    const updated = db.prepare(`SELECT label FROM object_types WHERE id = 'book'`).get() as {
      label: string;
    };
    expect(updated.label).toBe('Libri');
  });
});
