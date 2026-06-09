// Pure-TS types + interfaces for the semantic-search foundation.
//
// This module is driver-agnostic: no SQLite, no Electron, no `fetch`
// implementation. The Electron adapter (`apps/desktop/electron/ai/`) and
// the SQLite store provide the concrete I/O; this file only describes the
// shapes that cross those boundaries so both sides type-check against one
// source of truth.

import type { NotePath } from '../types/note.js';

/**
 * Pluggable embedding backend. v1's concrete implementation is the Ollama
 * HTTP provider; tests use a deterministic fake. Keeping this an interface
 * (not a class) lets us swap in bundled transformers.js later without
 * touching the indexing pipeline.
 */
export interface EmbeddingProvider {
  /**
   * Stable identifier combining provider + model, e.g.
   * `"ollama:nomic-embed-text"`. Persisted alongside each vector as
   * `model_id`; a mismatch on read triggers a re-embed (vectors from
   * different models aren't comparable).
   */
  readonly id: string;

  /**
   * Embed a batch of texts. Returns one Float32Array per input, in order.
   * Implementations MUST preserve order and length (`out.length === texts.length`).
   * May reject if the backend is unreachable — callers degrade gracefully.
   */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * A persisted embedding row, mirroring the `note_embeddings` table. The
 * `vector` is the decoded Float32Array (the SQLite layer stores it as a
 * little-endian BLOB and decodes on read).
 */
export type EmbeddingRow = {
  path: NotePath;
  title: string;
  contentHash: string;
  modelId: string;
  dim: number;
  vector: Float32Array;
  mtimeMs: number;
};

/** A single semantic-search result returned to the renderer. */
export type SemanticHit = {
  path: NotePath;
  title: string;
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number;
  /** Short body excerpt for display. Plain text, no highlight markup. */
  snippet: string;
};

/**
 * Status snapshot for the settings UI + search palette. `providerOk`
 * reflects the last health check; `running` is true while a full/batch
 * pass is in flight.
 */
export type EmbeddingStatus = {
  enabled: boolean;
  indexed: number;
  total: number;
  running: boolean;
  providerOk: boolean;
  modelId: string;
};

/**
 * Per-app (not per-vault) provider configuration. Persisted in userData
 * the same way recent-vaults is; the embeddings themselves live per-vault
 * in `<vault>/.ziba/index.db`.
 */
export type SemanticSettings = {
  enabled: boolean;
  baseUrl: string;
  model: string;
};

/** Built-in defaults. Multilingual model so Italian notes embed sensibly. */
export const DEFAULT_SEMANTIC_SETTINGS: SemanticSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
};

/**
 * Max characters of (title + body) we feed the embedder in v1. Chunking is
 * a later RAG-milestone concern; for "find by meaning" a truncated head is
 * plenty and keeps embedding cost bounded.
 */
export const EMBED_TEXT_MAX_CHARS = 2000;
