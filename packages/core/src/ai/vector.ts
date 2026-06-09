// Pure vector math + (de)serialization for embeddings. No driver, no
// Electron — just numbers and bytes, so it's trivially unit-testable and
// reusable from either process.
//
// `node:crypto` is the one Node builtin we lean on (for a stable content
// hash). It's available everywhere this package runs (main process, tests)
// and avoids pulling a hashing dependency into core.

import { createHash } from 'node:crypto';
import { EMBED_TEXT_MAX_CHARS } from './types.js';

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 *
 * Defensive returns of `0` (rather than throwing / NaN) for the two
 * degenerate cases — a zero-magnitude vector or a length mismatch — so the
 * brute-force ranking loop never has to special-case them. A length
 * mismatch shouldn't happen (all vectors share a model's `dim`), but a
 * model change mid-index could leave stale rows; returning 0 ranks them
 * last instead of crashing the search.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Serialize a Float32Array to a little-endian byte buffer for BLOB storage.
 * We force little-endian explicitly (rather than relying on the platform's
 * native order via `.buffer`) so a vault is portable across architectures.
 */
export function float32ToBlob(vec: Float32Array): Uint8Array {
  const out = new Uint8Array(vec.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < vec.length; i++) {
    view.setFloat32(i * 4, vec[i]!, true /* little-endian */);
  }
  return out;
}

/**
 * Decode a little-endian BLOB back into a Float32Array. Accepts any
 * ArrayBuffer-view-like input (better-sqlite3 hands back a `Buffer`).
 */
export function blobToFloat32(blob: Uint8Array): Float32Array {
  const count = Math.floor(blob.byteLength / 4);
  const view = new DataView(blob.buffer, blob.byteOffset, count * 4);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = view.getFloat32(i * 4, true /* little-endian */);
  }
  return out;
}

/**
 * Stable content hash. SHA-256 hex — collision-resistant enough that an
 * unchanged note reliably skips re-embedding, and a single edited byte
 * reliably triggers one.
 */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Build the text we actually embed for a note: title + body, truncated to
 * `EMBED_TEXT_MAX_CHARS`. Title leads so it dominates short-note
 * similarity; the body fills the rest. Whitespace-trimmed on both pieces.
 */
export function prepareEmbedText(title: string, body: string): string {
  const combined = `${title.trim()}\n\n${body.trim()}`.trim();
  return combined.length > EMBED_TEXT_MAX_CHARS
    ? combined.slice(0, EMBED_TEXT_MAX_CHARS)
    : combined;
}
