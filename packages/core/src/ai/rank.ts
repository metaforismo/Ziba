// Pure top-K ranking by cosine similarity. The brute-force scan is fine
// for thousands of notes (the spec's target); a vector index is a later
// optimization if vaults grow into the tens of thousands.

import { cosineSimilarity } from './vector.js';
import type { EmbeddingRow, SemanticHit } from './types.js';

/**
 * Score every row against `queryVec`, return the top `limit` as
 * `SemanticHit`s (without snippet — the caller fills that from note
 * content). Rows whose `dim` differs from the query are skipped: they were
 * embedded by a different model and aren't comparable (cosineSimilarity
 * would return 0 anyway, but skipping is clearer and slightly cheaper).
 */
export function rankBySimilarity(
  queryVec: Float32Array,
  rows: readonly EmbeddingRow[],
  limit: number,
): SemanticHit[] {
  const safeLimit = Math.max(1, Math.floor(limit) || 1);
  const scored: SemanticHit[] = [];
  for (const r of rows) {
    if (r.vector.length !== queryVec.length) continue;
    scored.push({
      path: r.path,
      title: r.title,
      score: cosineSimilarity(queryVec, r.vector),
      snippet: '',
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, safeLimit);
}
