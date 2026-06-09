import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { SqliteIndexStore } from './index-store.sqlite.js';

// Exercises the embedding CRUD through the REAL adapter class (prepared
// statements, BLOB (de)serialization, joins) against a throwaway on-disk
// vault. Verifies the little-endian Float32 round-trip survives SQLite.

let store: SqliteIndexStore;
let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ziba-emb-'));
  store = new SqliteIndexStore();
  await store.init(tmpRoot);
});

afterEach(async () => {
  await store.close();
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

async function addNote(p: string, title: string): Promise<void> {
  await store.upsertNote({ path: p, title, frontmatter: {}, wikilinks: [], mtimeMs: 0, body: '' });
}

describe('SqliteIndexStore embeddings', () => {
  it('upserts and reads back a vector exactly (little-endian round-trip)', async () => {
    await addNote('a.md', 'Alpha');
    const vec = new Float32Array([0.5, -0.25, 1, 0, -3.14159]);
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'hash-a',
      modelId: 'fake:hash-32',
      dim: vec.length,
      vector: vec,
      mtimeMs: 123,
    });

    const all = await store.getAllEmbeddings!();
    expect(all).toHaveLength(1);
    expect(all[0]!.sourcePath).toBe('a.md');
    expect(all[0]!.title).toBe('Alpha');
    expect(Array.from(all[0]!.vector)).toEqual(Array.from(vec));
  });

  it('upsert replaces the existing row for a path', async () => {
    await addNote('a.md', 'Alpha');
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h1',
      modelId: 'm',
      dim: 2,
      vector: new Float32Array([1, 1]),
      mtimeMs: 1,
    });
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h2',
      modelId: 'm',
      dim: 2,
      vector: new Float32Array([2, 2]),
      mtimeMs: 2,
    });
    const all = await store.getAllEmbeddings!();
    expect(all).toHaveLength(1);
    expect(all[0]!.contentHash).toBe('h2');
  });

  it('getEmbeddingMeta returns hash+model for the skip check, null when absent', async () => {
    await addNote('a.md', 'Alpha');
    expect(await store.getEmbeddingMeta!('a.md')).toBeNull();
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h',
      modelId: 'ollama:x',
      dim: 1,
      vector: new Float32Array([1]),
      mtimeMs: 0,
    });
    expect(await store.getEmbeddingMeta!('a.md')).toEqual({
      contentHash: 'h',
      modelId: 'ollama:x',
    });
  });

  it('deleteEmbedding removes the row', async () => {
    await addNote('a.md', 'Alpha');
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h',
      modelId: 'm',
      dim: 1,
      vector: new Float32Array([1]),
      mtimeMs: 0,
    });
    await store.deleteEmbedding!('a.md');
    expect(await store.getAllEmbeddings!()).toHaveLength(0);
  });

  it('counts indexed vs total notes', async () => {
    await addNote('a.md', 'Alpha');
    await addNote('b.md', 'Beta');
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h',
      modelId: 'm',
      dim: 1,
      vector: new Float32Array([1]),
      mtimeMs: 0,
    });
    expect(await store.getEmbeddingCounts!()).toEqual({ indexed: 1, total: 2 });
  });

  it('clearEmbeddings drops every row', async () => {
    await addNote('a.md', 'Alpha');
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h',
      modelId: 'm',
      dim: 1,
      vector: new Float32Array([1]),
      mtimeMs: 0,
    });
    await store.clearEmbeddings!();
    expect(await store.getEmbeddingCounts!()).toEqual({ indexed: 0, total: 1 });
  });

  it('orphan embeddings (no notes row) are excluded from getAllEmbeddings', async () => {
    // Embedding written, then the note deleted out from under it: the INNER
    // JOIN on notes must drop it from search.
    await addNote('a.md', 'Alpha');
    await store.upsertEmbedding!({
      sourcePath: 'a.md',
      title: '',
      contentHash: 'h',
      modelId: 'm',
      dim: 1,
      vector: new Float32Array([1]),
      mtimeMs: 0,
    });
    await store.deleteNote('a.md');
    expect(await store.getAllEmbeddings!()).toHaveLength(0);
  });
});
