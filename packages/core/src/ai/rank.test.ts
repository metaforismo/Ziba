import { describe, expect, it } from 'vitest';
import { rankBySimilarity } from './rank.js';
import type { EmbeddingRow } from './types.js';

function row(path: string, vector: number[]): EmbeddingRow {
  return {
    path,
    title: path,
    contentHash: 'h',
    modelId: 'fake',
    dim: vector.length,
    vector: new Float32Array(vector),
    mtimeMs: 0,
  };
}

describe('rankBySimilarity', () => {
  const rows: EmbeddingRow[] = [
    row('a.md', [1, 0, 0]),
    row('b.md', [0.9, 0.1, 0]),
    row('c.md', [0, 1, 0]),
    row('d.md', [-1, 0, 0]),
  ];

  it('orders by descending cosine similarity', () => {
    const query = new Float32Array([1, 0, 0]);
    const out = rankBySimilarity(query, rows, 10);
    expect(out.map((r) => r.path)).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
  });

  it('respects the limit (top-K)', () => {
    const query = new Float32Array([1, 0, 0]);
    const out = rankBySimilarity(query, rows, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.path)).toEqual(['a.md', 'b.md']);
  });

  it('returns each hit with path, title and score', () => {
    const out = rankBySimilarity(new Float32Array([1, 0, 0]), rows, 1);
    expect(out[0]).toMatchObject({ path: 'a.md', title: 'a.md' });
    expect(typeof out[0]!.score).toBe('number');
  });

  it('returns empty for empty input', () => {
    expect(rankBySimilarity(new Float32Array([1, 0, 0]), [], 5)).toEqual([]);
  });

  it('skips rows whose dim does not match the query (stale model)', () => {
    const mixed = [...rows, row('wrong.md', [1, 0])];
    const out = rankBySimilarity(new Float32Array([1, 0, 0]), mixed, 10);
    expect(out.map((r) => r.path)).not.toContain('wrong.md');
  });

  it('clamps a non-positive limit to at least one result', () => {
    const out = rankBySimilarity(new Float32Array([1, 0, 0]), rows, 0);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });
});
