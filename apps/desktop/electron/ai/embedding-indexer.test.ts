import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeEmbeddingProvider,
  type EmbeddingMeta,
  type EmbeddingProvider,
  type EmbeddingStoreRow,
  type IndexStoreAdapter,
  type NotePath,
  type SemanticSettings,
} from '@ziba/core';
import { EmbeddingIndexer, type NoteBodyLoader } from './embedding-indexer.js';

// Unit tests for the indexer orchestration, with a deterministic
// FakeEmbeddingProvider and an in-memory store stub — no SQLite, no Ollama,
// no Electron window. Covers: skip-if-unchanged, debounce coalescing,
// provider-unreachable abort, the dispose-mid-pass teardown guard, and the
// four search degradation reasons.

// ---- In-memory store stub ------------------------------------------------

type StubOpts = {
  /** Throw from upsertEmbedding to simulate a closed DB. */
  failUpsert?: boolean;
};

class StubStore {
  embeddings = new Map<NotePath, EmbeddingStoreRow>();
  /** Paths that have a `notes` row (for the INNER-JOIN-style count/getAll). */
  notes = new Set<NotePath>();
  upsertCalls = 0;

  constructor(private readonly opts: StubOpts = {}) {}

  upsertEmbedding(row: EmbeddingStoreRow): Promise<void> {
    this.upsertCalls++;
    if (this.opts.failUpsert) return Promise.reject(new Error('IndexStore not initialized'));
    this.embeddings.set(row.sourcePath, { ...row });
    this.notes.add(row.sourcePath);
    return Promise.resolve();
  }

  deleteEmbedding(p: NotePath): Promise<void> {
    this.embeddings.delete(p);
    return Promise.resolve();
  }

  getEmbeddingMeta(p: NotePath): Promise<EmbeddingMeta | null> {
    const row = this.embeddings.get(p);
    return Promise.resolve(row ? { contentHash: row.contentHash, modelId: row.modelId } : null);
  }

  getAllEmbeddings(): Promise<EmbeddingStoreRow[]> {
    // Mirror the adapter's INNER JOIN on notes: only rows with a notes entry.
    return Promise.resolve(
      [...this.embeddings.values()].filter((r) => this.notes.has(r.sourcePath)),
    );
  }

  getEmbeddingCounts(): Promise<{ indexed: number; total: number }> {
    const indexed = [...this.embeddings.keys()].filter((p) => this.notes.has(p)).length;
    return Promise.resolve({ indexed, total: this.notes.size });
  }

  clearEmbeddings(): Promise<void> {
    this.embeddings.clear();
    return Promise.resolve();
  }

  asAdapter(): IndexStoreAdapter {
    // The indexer only touches the embedding methods; cast through unknown so
    // we don't have to stub the entire (large) IndexStoreAdapter surface.
    return this as unknown as IndexStoreAdapter;
  }
}

// ---- Helpers -------------------------------------------------------------

const SETTINGS_ON: SemanticSettings = {
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'fake',
};
const SETTINGS_OFF: SemanticSettings = { ...SETTINGS_ON, enabled: false };

function makeLoader(bodies: Record<string, { title: string; body: string }>): NoteBodyLoader {
  return (p) => Promise.resolve(bodies[p] ?? null);
}

/** Provider that always rejects — simulates Ollama being down. */
class DeadProvider implements EmbeddingProvider {
  readonly id = 'dead:provider';
  calls = 0;
  embed(): Promise<Float32Array[]> {
    this.calls++;
    return Promise.reject(new Error('ECONNREFUSED'));
  }
}

function makeIndexer(
  store: StubStore,
  bodies: Record<string, { title: string; body: string }>,
  settings: SemanticSettings,
  provider: EmbeddingProvider = new FakeEmbeddingProvider(),
): EmbeddingIndexer {
  const paths = Object.keys(bodies);
  // Register a notes row for each known body so counts/getAll see them.
  for (const p of paths) store.notes.add(p);
  return new EmbeddingIndexer(
    store.asAdapter(),
    makeLoader(bodies),
    () => Promise.resolve(paths),
    () => null, // no window in tests
    settings,
    () => provider,
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Tests ---------------------------------------------------------------

describe('EmbeddingIndexer full pass', () => {
  it('embeds every note on a full pass', async () => {
    const store = new StubStore();
    const bodies = {
      'a.md': { title: 'Alpha', body: 'machine learning' },
      'b.md': { title: 'Beta', body: 'banana bread' },
    };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    await idx.runFullPass(false);
    expect(store.embeddings.size).toBe(2);
    expect(store.upsertCalls).toBe(2);
  });

  it('does nothing when the feature is disabled (no provider calls)', async () => {
    const store = new StubStore();
    const dead = new DeadProvider();
    const idx = makeIndexer(store, { 'a.md': { title: 'A', body: 'x' } }, SETTINGS_OFF, dead);
    await idx.runFullPass(false);
    expect(dead.calls).toBe(0);
    expect(store.upsertCalls).toBe(0);
  });

  it('skips a note whose content_hash + model_id are unchanged', async () => {
    const store = new StubStore();
    const bodies = { 'a.md': { title: 'Alpha', body: 'unchanged content' } };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    await idx.runFullPass(false);
    expect(store.upsertCalls).toBe(1);
    // Second pass: same content + same model → skipped, no new upsert.
    await idx.runFullPass(false);
    expect(store.upsertCalls).toBe(1);
  });

  it('re-embeds when the note content changes', async () => {
    const store = new StubStore();
    const bodies = { 'a.md': { title: 'Alpha', body: 'first version' } };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    await idx.runFullPass(false);
    expect(store.upsertCalls).toBe(1);
    bodies['a.md'].body = 'a completely different second version';
    await idx.runFullPass(false);
    expect(store.upsertCalls).toBe(2);
  });

  it('force re-embeds even when content is unchanged', async () => {
    const store = new StubStore();
    const bodies = { 'a.md': { title: 'Alpha', body: 'unchanged' } };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    await idx.runFullPass(false);
    await idx.runFullPass(true); // force
    expect(store.upsertCalls).toBe(2);
  });

  it('aborts the pass when the provider is unreachable, without hammering it', async () => {
    const store = new StubStore();
    const dead = new DeadProvider();
    const bodies: Record<string, { title: string; body: string }> = {};
    // More notes than one batch (BATCH_SIZE=8) so a non-aborting impl would
    // call embed multiple times.
    for (let i = 0; i < 20; i++) bodies[`n${i}.md`] = { title: `N${i}`, body: `body ${i}` };
    const idx = makeIndexer(store, bodies, SETTINGS_ON, dead);
    await idx.runFullPass(false);
    // Exactly one embed attempt (the first batch) — the pass aborts on the
    // first failure instead of retrying every batch.
    expect(dead.calls).toBe(1);
    expect(store.embeddings.size).toBe(0);
  });
});

describe('EmbeddingIndexer debounce', () => {
  it('coalesces rapid enqueues into a single pass', async () => {
    vi.useFakeTimers();
    const store = new StubStore();
    const bodies = {
      'a.md': { title: 'A', body: 'alpha body' },
      'b.md': { title: 'B', body: 'beta body' },
    };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    idx.enqueue('a.md');
    idx.enqueue('b.md');
    idx.enqueue('a.md'); // duplicate within the window
    // Nothing should have run yet (still inside the debounce window).
    expect(store.upsertCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();
    // Both unique paths embedded once; the duplicate 'a.md' coalesced.
    expect(store.embeddings.size).toBe(2);
    expect(store.upsertCalls).toBe(2);
    vi.useRealTimers();
  });
});

describe('EmbeddingIndexer dispose / teardown guard', () => {
  it('dispose() mid-pass settles and prevents writes to a closed store', async () => {
    // Simulates a vault switch while a full pass is in flight: dispose() is
    // called (from teardown, a SEPARATE context) while an embed is pending.
    // The post-embed `disposed` guard must skip the upsert loop so a
    // closed-DB write (modeled by failUpsert) is never attempted, and the
    // whole thing settles without an unhandled rejection.
    const store = new StubStore({ failUpsert: true });
    const bodies: Record<string, { title: string; body: string }> = {};
    for (let i = 0; i < 20; i++) bodies[`n${i}.md`] = { title: `N${i}`, body: `body ${i}` };

    // A provider whose first embed blocks on an external deferred, so the
    // test controls exactly when the "network call" resolves.
    let releaseEmbed: () => void = () => {};
    const embedPending = new Promise<void>((resolve) => {
      releaseEmbed = resolve;
    });
    const provider: EmbeddingProvider = {
      id: 'fake:hash-32',
      embed: async (texts) => {
        await embedPending;
        return texts.map(() => new Float32Array([1, 0, 0]));
      },
    };
    const idx = makeIndexer(store, bodies, SETTINGS_ON, provider);

    // Start the pass; it parks in `embed` awaiting our deferred.
    const pass = idx.runFullPass(false);
    // Dispose from the outside (teardown context). dispose() awaits the
    // in-flight pass — so we kick the embed loose on the next microtask.
    const disposed = idx.dispose();
    releaseEmbed();

    await expect(Promise.all([pass, disposed])).resolves.toBeDefined();
    // The post-embed disposed-guard skipped the loop: no upsert attempted.
    expect(store.upsertCalls).toBe(0);
  });

  it('a disposed indexer accepts no new work', () => {
    const store = new StubStore();
    const idx = makeIndexer(store, { 'a.md': { title: 'A', body: 'x' } }, SETTINGS_ON);
    void idx.dispose();
    idx.enqueue('a.md');
    expect(store.upsertCalls).toBe(0);
  });
});

describe('EmbeddingIndexer search degradation', () => {
  it('reason "disabled" when the feature is off', async () => {
    const store = new StubStore();
    const idx = makeIndexer(store, {}, SETTINGS_OFF);
    const res = await idx.search('query', 10);
    expect(res).toEqual({ ok: false, reason: 'disabled', message: expect.any(String) });
  });

  it('reason "not-indexed" when there are no stored vectors', async () => {
    const store = new StubStore();
    const idx = makeIndexer(store, {}, SETTINGS_ON);
    const res = await idx.search('query', 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not-indexed');
  });

  it('reason "provider-unreachable" when the query embed fails', async () => {
    const store = new StubStore();
    const bodies = { 'a.md': { title: 'A', body: 'alpha' } };
    // Index first with a working fake provider so the store is non-empty
    // (otherwise we'd short-circuit on "not-indexed" before touching Ollama).
    const idx = makeIndexer(store, bodies, SETTINGS_ON, new FakeEmbeddingProvider());
    await idx.runFullPass(false);
    expect(store.embeddings.size).toBe(1);

    // A second indexer over the SAME store, but its provider is down — the
    // query embed throws, so search must report provider-unreachable.
    const deadIdx = makeIndexer(store, bodies, SETTINGS_ON, new DeadProvider());
    const res = await deadIdx.search('query', 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('provider-unreachable');
  });

  it('reason "error" when reading the index throws', async () => {
    const store = new StubStore();
    store.notes.add('a.md');
    // Force getAllEmbeddings to throw.
    vi.spyOn(store, 'getAllEmbeddings').mockRejectedValue(new Error('disk gone'));
    const idx = makeIndexer(store, { 'a.md': { title: 'A', body: 'x' } }, SETTINGS_ON);
    const res = await idx.search('query', 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('error');
  });

  it('returns ranked hits with snippets when everything is healthy', async () => {
    const store = new StubStore();
    const bodies = {
      'ml.md': { title: 'ML', body: 'machine learning models and training' },
      'food.md': { title: 'Food', body: 'banana bread recipe with walnuts' },
    };
    const idx = makeIndexer(store, bodies, SETTINGS_ON);
    await idx.runFullPass(false);
    const res = await idx.search('machine learning training', 10);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.hits.length).toBeGreaterThan(0);
      // The ML note should outrank the food note for an ML query.
      expect(res.hits[0]!.path).toBe('ml.md');
      expect(res.hits[0]!.snippet.length).toBeGreaterThan(0);
    }
  });
});
