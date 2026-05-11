import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { EXPECTED_USER_VERSION, PRAGMAS, SCHEMA_SQL } from '@ziba/core';

// Integration tests for statements added to SqliteIndexStore that are not
// covered by index-store-relations.test.ts. Uses an in-memory SQLite DB
// (same pattern as that file) so we exercise the real SQL without
// touching the filesystem or Electron APIs.

let db: Database.Database;

function setupNote(path: string, title = path.replace(/\.md$/, '')): void {
  db.prepare(
    `INSERT INTO notes (path, title, frontmatter_json, mtime)
     VALUES (?, ?, '{}', 0)
     ON CONFLICT (path) DO NOTHING`,
  ).run(path, title);
}

function insertTypeProp(path: string, type: string): void {
  db.prepare(
    `INSERT INTO note_properties (source_path, prop_key, prop_type, text_value)
     VALUES (?, 'type', 'text', ?)`,
  ).run(path, type);
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

describe('getTypedPaths', () => {
  it('returns one entry per typed note, mapping path → type slug', () => {
    setupNote('books/hobbit.md', 'The Hobbit');
    insertTypeProp('books/hobbit.md', 'book');

    setupNote('people/tolkien.md', 'Tolkien');
    insertTypeProp('people/tolkien.md', 'person');

    setupNote('untyped.md', 'Untyped');
    // no type property for untyped.md

    const rows = db
      .prepare(
        `SELECT source_path AS path, text_value AS type
         FROM note_properties
         WHERE prop_key = 'type'
           AND prop_type = 'text'
           AND text_value IS NOT NULL
           AND text_value <> ''`,
      )
      .all() as { path: string; type: string }[];

    const got = new Map(rows.map((r) => [r.path, r.type]));

    expect(got).toBeInstanceOf(Map);
    expect(got.size).toBe(2);
    expect(got.get('books/hobbit.md')).toBe('book');
    expect(got.get('people/tolkien.md')).toBe('person');
    expect(got.has('untyped.md')).toBe(false);
  });

  it('returns an empty map on a fresh vault', () => {
    const rows = db
      .prepare(
        `SELECT source_path AS path, text_value AS type
         FROM note_properties
         WHERE prop_key = 'type'
           AND prop_type = 'text'
           AND text_value IS NOT NULL
           AND text_value <> ''`,
      )
      .all() as { path: string; type: string }[];

    const got = new Map(rows.map((r) => [r.path, r.type]));

    expect(got.size).toBe(0);
  });

  it('excludes rows whose prop_type is not "text" even if text_value is set', () => {
    setupNote('note.md');
    // A note that wrote `type: https://foo.bar` — replaceProperties stores
    // text_value='https://foo.bar' with prop_type='url'. getTypedPaths must
    // exclude this; the type slug is reserved for prop_type='text' entries.
    db.prepare(
      `INSERT INTO note_properties (source_path, prop_key, prop_type, text_value)
       VALUES (?, 'type', 'url', 'https://foo.bar')`,
    ).run('note.md');

    const rows = db
      .prepare(
        `SELECT source_path AS path, text_value AS type
         FROM note_properties
         WHERE prop_key = 'type'
           AND prop_type = 'text'
           AND text_value IS NOT NULL
           AND text_value <> ''`,
      )
      .all();

    expect(rows).toHaveLength(0);
  });
});

describe('graph nodes — type + color join', () => {
  it('returns null type/color for untyped notes', () => {
    setupNote('untyped.md');
    const rows = db
      .prepare(
        `SELECT n.path AS path, n.title AS title, np.text_value AS type, ot.color AS color
         FROM notes n
         LEFT JOIN note_properties np
           ON np.source_path = n.path
          AND np.prop_key = 'type'
          AND np.prop_type = 'text'
          AND np.text_value IS NOT NULL
          AND np.text_value <> ''
         LEFT JOIN object_types ot ON ot.id = np.text_value`,
      )
      .all() as Array<{ path: string; title: string; type: string | null; color: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ path: 'untyped.md', title: 'untyped', type: null, color: null });
  });

  it('returns the type slug + null color when no schema is cached for the type', () => {
    setupNote('book.md');
    db.prepare(
      `INSERT INTO note_properties (source_path, prop_key, prop_type, text_value)
       VALUES (?, 'type', 'text', 'book')`,
    ).run('book.md');
    const rows = db
      .prepare(
        `SELECT n.path AS path, np.text_value AS type, ot.color AS color
         FROM notes n
         LEFT JOIN note_properties np
           ON np.source_path = n.path
          AND np.prop_key = 'type'
          AND np.prop_type = 'text'
          AND np.text_value IS NOT NULL
          AND np.text_value <> ''
         LEFT JOIN object_types ot ON ot.id = np.text_value`,
      )
      .all() as Array<{ path: string; type: string | null; color: string | null }>;
    expect(rows[0]?.type).toBe('book');
    expect(rows[0]?.color).toBeNull();
  });

  it('returns type + color when a schema with a color is cached', () => {
    setupNote('book.md');
    db.prepare(
      `INSERT INTO note_properties (source_path, prop_key, prop_type, text_value)
       VALUES (?, 'type', 'text', 'book')`,
    ).run('book.md');
    db.prepare(
      `INSERT INTO object_types (id, label, icon, color, schema_json, mtime)
       VALUES ('book', 'Libro', '📖', '#6366f1', '{}', 0)`,
    ).run();
    const rows = db
      .prepare(
        `SELECT n.path AS path, np.text_value AS type, ot.color AS color
         FROM notes n
         LEFT JOIN note_properties np
           ON np.source_path = n.path
          AND np.prop_key = 'type'
          AND np.prop_type = 'text'
          AND np.text_value IS NOT NULL
          AND np.text_value <> ''
         LEFT JOIN object_types ot ON ot.id = np.text_value`,
      )
      .all() as Array<{ path: string; type: string | null; color: string | null }>;
    expect(rows[0]?.type).toBe('book');
    expect(rows[0]?.color).toBe('#6366f1');
  });
});

describe('graph edges — kind passthrough', () => {
  it('returns the kind column on every edge (empty string for generic body wikilinks)', () => {
    setupNote('a.md');
    setupNote('b.md');
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, '', 'B', 'b.md')`,
    ).run('a.md');
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, 'author', 'B', 'b.md')`,
    ).run('a.md');
    const rows = db
      .prepare(
        `SELECT r.source_path AS source, r.target_path AS target,
                n.title AS target_title, r.kind AS kind
         FROM relations r
         JOIN notes n ON n.path = r.target_path
         WHERE r.target_path IS NOT NULL
         ORDER BY r.kind`,
      )
      .all() as Array<{ source: string; target: string; target_title: string; kind: string }>;
    expect(rows.map((r) => r.kind)).toEqual(['', 'author']);
  });
});
