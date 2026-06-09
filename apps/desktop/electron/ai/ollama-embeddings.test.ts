import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaEmbeddingProvider, OllamaUnavailableError } from './ollama-embeddings.js';

// The provider is the one network-touching piece. These tests stub global
// `fetch` to prove the two contracts the pipeline relies on: a valid
// response decodes to a Float32Array, and EVERY failure mode surfaces as a
// typed OllamaUnavailableError (so the indexer degrades, never crashes).

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OllamaEmbeddingProvider', () => {
  it('derives a stable id from the model', () => {
    const p = new OllamaEmbeddingProvider({
      baseUrl: 'http://localhost:11434',
      model: 'nomic-embed-text',
    });
    expect(p.id).toBe('ollama:nomic-embed-text');
  });

  it('decodes a valid embedding response, preserving batch order', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const { prompt } = JSON.parse(init.body) as { prompt: string };
        calls.push(prompt);
        // Echo a vector whose first element encodes the prompt length, so
        // we can assert order is preserved.
        return {
          ok: true,
          json: async () => ({ embedding: [prompt.length, 0.5, -0.5] }),
        };
      }),
    );
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    const out = await p.embed(['ab', 'abcd']);
    expect(out).toHaveLength(2);
    expect(out[0]![0]).toBe(2);
    expect(out[1]![0]).toBe(4);
    expect(calls).toEqual(['ab', 'abcd']);
  });

  it('throws OllamaUnavailableError when the daemon is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('throws OllamaUnavailableError on a non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' })),
    );
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('throws OllamaUnavailableError on an empty / malformed embedding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ embedding: [] }) })),
    );
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('ping returns false when unreachable, true on ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    const up = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    expect(await up.ping()).toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('refused');
      }),
    );
    const down = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'm' });
    expect(await down.ping()).toBe(false);
  });

  it('normalizes a trailing slash in the base URL', async () => {
    let calledUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calledUrl = url;
        return { ok: true, json: async () => ({ embedding: [1] }) };
      }),
    );
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434/', model: 'm' });
    await p.embed(['x']);
    expect(calledUrl).toBe('http://localhost:11434/api/embeddings');
  });
});
