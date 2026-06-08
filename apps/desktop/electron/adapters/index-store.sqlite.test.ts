import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  EXPECTED_USER_VERSION,
  MENTION_EDGE_KIND,
  mergeMentionEdges,
  mergeUnresolvedNodes,
  PRAGMAS,
  SCHEMA_SQL,
  unresolvedNodeId,
  type GraphEdge,
  type MentionEdge,
} from '@ziba/core';

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

function insertFts(path: string, title: string, body: string): void {
  db.prepare(`INSERT INTO notes_fts (path, title, body) VALUES (?, ?, ?)`).run(path, title, body);
}

// Mirrors the per-target FTS scan in `SqliteIndexStore.getMentionEdges`:
// for each note title, find OTHER notes whose body matches the title,
// emitting a (mentioning → mentioned) candidate. Kept inline so the test
// exercises the same FTS query shape without booting the adapter class.
function collectMentionCandidates(): MentionEdge[] {
  const notes = db.prepare(`SELECT path, title FROM notes`).all() as Array<{
    path: string;
    title: string;
  }>;
  const out: MentionEdge[] = [];
  for (const target of notes) {
    if (target.title.trim().length < 2) continue;
    const hits = db
      .prepare(`SELECT path FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank`)
      .all(`"${target.title.replace(/"/g, '""')}"`) as Array<{ path: string }>;
    for (const hit of hits) {
      if (hit.path === target.path) continue;
      out.push({ source: hit.path, target: target.path, targetTitle: target.title });
    }
  }
  return out;
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

describe('soft references — FTS mention detection + dedupe', () => {
  it('emits a mention edge for an unlinked title match, deduped against explicit links', () => {
    setupNote('people/ada.md', 'Ada Lovelace');
    setupNote('projects/engine.md', 'Analytical Engine');
    setupNote('letters/note.md', 'A letter');

    insertFts('people/ada.md', 'Ada Lovelace', 'About herself.');
    // Engine links to Ada explicitly via a wikilink (also matches FTS).
    insertFts('projects/engine.md', 'Analytical Engine', 'Built by [[Ada Lovelace]].');
    // A plain prose mention with no wikilink → soft reference.
    insertFts('letters/note.md', 'A letter', 'A plain-text Ada Lovelace mention.');

    // Explicit edge: engine → ada.
    const explicit: GraphEdge[] = [
      {
        source: 'projects/engine.md',
        target: 'people/ada.md',
        targetTitle: 'Ada Lovelace',
        kind: '',
      },
    ];
    const known = new Set(['people/ada.md', 'projects/engine.md', 'letters/note.md']);

    const candidates = collectMentionCandidates();
    const merged = mergeMentionEdges(explicit, candidates, known);
    const mentionEdges = merged.filter((e) => e.kind === MENTION_EDGE_KIND);

    // Only the letter → ada mention survives: engine→ada is an explicit
    // link (deduped), and ada→herself is a self-mention (skipped).
    expect(mentionEdges).toEqual([
      {
        source: 'letters/note.md',
        target: 'people/ada.md',
        targetTitle: 'Ada Lovelace',
        kind: MENTION_EDGE_KIND,
      },
    ]);
  });
});

describe('graph broken links — unresolved phantom derivation', () => {
  // Mirrors SqliteIndexStore.graphBrokenLinks: relations with a null
  // target_path are the broken wikilinks that become gray phantom nodes.
  function selectBrokenLinks(): Array<{ source: string; targetTitle: string }> {
    const rows = db
      .prepare(
        `SELECT DISTINCT r.source_path AS source, r.target_title AS target_title
         FROM relations r
         WHERE r.target_path IS NULL
           AND r.target_title IS NOT NULL
           AND TRIM(r.target_title) <> ''`,
      )
      .all() as Array<{ source: string; target_title: string }>;
    return rows.map((r) => ({ source: r.source, targetTitle: r.target_title }));
  }

  it('surfaces a [[X]] with no backing file as a broken link; a resolved one is excluded', () => {
    setupNote('a.md');
    setupNote('b.md');
    // Resolved wikilink (target_path set) → NOT a broken link.
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, '', 'B', 'b.md')`,
    ).run('a.md');
    // Broken wikilink (target_path NULL) → IS a broken link.
    db.prepare(
      `INSERT INTO relations (source_path, kind, target_title, target_path)
       VALUES (?, '', 'Concept', NULL)`,
    ).run('a.md');

    const broken = selectBrokenLinks();
    expect(broken).toEqual([{ source: 'a.md', targetTitle: 'Concept' }]);

    // End-to-end: folding through the pure core helper yields one phantom
    // node + its incoming edge, and leaves the resolved target alone.
    const graph = {
      nodes: [
        { path: 'a.md', title: 'A', type: null, color: null },
        { path: 'b.md', title: 'B', type: null, color: null },
      ],
      edges: [{ source: 'a.md', target: 'b.md', targetTitle: 'B', kind: '' }],
    };
    const out = mergeUnresolvedNodes(graph, broken);
    const phantom = out.nodes.find((n) => n.unresolved === true);
    expect(phantom?.path).toBe(unresolvedNodeId('Concept'));
    expect(phantom?.title).toBe('Concept');
    expect(out.edges).toContainEqual({
      source: 'a.md',
      target: unresolvedNodeId('Concept'),
      targetTitle: 'Concept',
      kind: '',
    });
  });
});
