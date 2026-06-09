// Deterministic, dependency-free embedding provider for tests.
//
// It is NOT a real semantic model — it's a hashed bag-of-words: each
// whitespace token is hashed into a dimension and accumulated, then the
// vector is L2-normalized. This gives the two properties our tests (and
// the ranking pipeline) need:
//   1. Determinism — same text always yields the same vector.
//   2. Token overlap → higher cosine similarity, so ranking order is
//      testable without standing up Ollama.

import { hashContent } from './vector.js';
import type { EmbeddingProvider } from './types.js';

const DEFAULT_DIM = 32;

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  private readonly dim: number;

  constructor(dim: number = DEFAULT_DIM) {
    this.dim = dim;
    this.id = `fake:hash-${dim}`;
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    return Promise.resolve(texts.map((t) => this.embedOne(t)));
  }

  private embedOne(text: string): Float32Array {
    const vec = new Float32Array(this.dim);
    // Tokenize loosely; lowercase so casing doesn't fragment the bag.
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    // Empty input still needs a non-zero vector (cosine of a zero vector is
    // undefined); seed one dimension from the raw text hash.
    if (tokens.length === 0) {
      const h = parseInt(hashContent(text).slice(0, 8), 16);
      vec[h % this.dim] = 1;
      return vec;
    }
    for (const tok of tokens) {
      // Two independent hash slices: one picks the bucket, one the sign,
      // so distinct tokens spread across dimensions rather than piling up.
      const h = hashContent(tok);
      const bucket = parseInt(h.slice(0, 8), 16) % this.dim;
      const sign = (parseInt(h.slice(8, 10), 16) & 1) === 0 ? 1 : -1;
      vec[bucket] = (vec[bucket] ?? 0) + sign;
    }
    // L2-normalize so every vector is unit length → cosine == dot product
    // and self-similarity is exactly 1.
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      const x = vec[i] ?? 0;
      norm += x * x;
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) vec[i] = (vec[i] ?? 0) / norm;
    } else {
      // Degenerate (e.g. tokens cancelled out); fall back to a hash seed.
      const h = parseInt(hashContent(text).slice(0, 8), 16);
      vec[h % this.dim] = 1;
    }
    return vec;
  }
}
