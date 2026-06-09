// Ollama embedding provider (v1 backend for semantic search).
//
// Talks to a locally-running Ollama daemon over HTTP — no native deps, no
// cloud, notes never leave the machine. Ollama's embeddings endpoint takes
// ONE prompt per call, so a batch is issued sequentially. Every network
// path is defensive: a timeout and a clear error so the indexing pipeline
// can degrade (mark provider unreachable) rather than crash.

import type { EmbeddingProvider } from '@ziba/core';

export type OllamaConfig = {
  baseUrl: string;
  model: string;
  /** Per-request timeout in ms. Generous: first call may load the model. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/** Thrown when Ollama is unreachable or returns an error. Carries a
 *  user-facing Italian message so the IPC layer can surface it directly. */
export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

type EmbeddingsResponse = {
  embedding?: number[];
};

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: OllamaConfig) {
    // Normalize: drop a trailing slash so `${baseUrl}/api/...` is clean.
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.id = `ollama:${this.model}`;
  }

  /**
   * Embed each text with a sequential round-trip. Order + length are
   * preserved (one output vector per input). Any failure (network,
   * timeout, bad status, malformed body) throws `OllamaUnavailableError`
   * so the caller can degrade gracefully.
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (const text of texts) {
      out.push(await this.embedOne(text));
    }
    return out;
  }

  private async embedOne(prompt: string): Promise<Float32Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new OllamaUnavailableError(
          `Ollama ha risposto con stato ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`,
        );
      }
      const data = (await res.json()) as EmbeddingsResponse;
      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        throw new OllamaUnavailableError(
          `Ollama non ha restituito un embedding valido per il modello "${this.model}". Verifica che il modello sia installato (ollama pull ${this.model}).`,
        );
      }
      return Float32Array.from(data.embedding);
    } catch (err) {
      if (err instanceof OllamaUnavailableError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OllamaUnavailableError(
          `Timeout dopo ${this.timeoutMs} ms contattando Ollama su ${this.baseUrl}.`,
        );
      }
      // ECONNREFUSED / DNS / TypeError("fetch failed"): Ollama is not
      // running or the URL is wrong. Give an actionable hint.
      throw new OllamaUnavailableError(
        `Impossibile contattare Ollama su ${this.baseUrl}. Avvia Ollama (ollama serve) e riprova.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Lightweight health check for the status surface. Returns true if the
   * daemon answers `/api/tags` (cheaper than an embed; doesn't require the
   * model to be pulled). Never throws.
   */
  async ping(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
