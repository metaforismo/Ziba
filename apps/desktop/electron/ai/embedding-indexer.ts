// Background embedding pipeline for the currently-open vault.
//
// Responsibilities:
//   - hold the active EmbeddingProvider (built from the per-app settings),
//   - (re)embed notes on create/save/rename and drop them on delete,
//   - run a full pass on demand (enable / reindex) with progress + cancel,
//   - answer semantic queries by brute-force cosine over stored vectors,
//   - degrade gracefully when Ollama is unreachable (never throw across IPC).
//
// It batches with awaited yields so a large vault never blocks the main
// thread for long. One instance lives per open vault (created on
// openVault, torn down on close), mirroring the watcher lifecycle.

import type { BrowserWindow } from 'electron';
import {
  prepareEmbedText,
  rankBySimilarity,
  type EmbeddingProvider,
  type EmbeddingStatus,
  type IndexStoreAdapter,
  type NotePath,
  type SemanticHit,
  type SemanticSettings,
} from '@ziba/core';
import { IpcChannels, type EmbeddingProgressPayload } from '../../shared/ipc.js';
import { hashContent } from './content-hash.js';
import { OllamaEmbeddingProvider } from './ollama-embeddings.js';

/** What the indexer needs to read a note's body for embedding. */
export type NoteBodyLoader = (path: NotePath) => Promise<{ title: string; body: string } | null>;

/** How many notes to embed before yielding back to the event loop. */
const BATCH_SIZE = 8;
/** Debounce window for coalescing rapid single-note (re)embeds after saves. */
const DEBOUNCE_MS = 800;
/** Max snippet length shown in a search hit. */
const SNIPPET_CHARS = 160;

export class EmbeddingIndexer {
  private provider: EmbeddingProvider;
  private settings: SemanticSettings;
  private running = false;
  private cancelRequested = false;
  private providerOk = true;
  private pendingPaths = new Set<NotePath>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  // Promise for the in-flight pass (full or flush), so dispose() can await
  // it and the caller (teardown) can safely close the DB afterwards.
  private activePass: Promise<void> | null = null;

  constructor(
    private readonly store: IndexStoreAdapter,
    private readonly loadBody: NoteBodyLoader,
    private readonly listPaths: () => Promise<NotePath[]>,
    private readonly getWindow: () => BrowserWindow | null,
    settings: SemanticSettings,
    // Seam for tests: swap in a deterministic provider (the production path
    // always builds an Ollama HTTP provider).
    private readonly providerFactory: (s: SemanticSettings) => EmbeddingProvider = buildProvider,
  ) {
    this.settings = settings;
    this.provider = providerFactory(settings);
  }

  // ---- lifecycle ------------------------------------------------------

  /** Swap settings at runtime (settings UI). Rebuilds the provider; if the
   *  model changed, stored vectors with a different model_id will simply be
   *  re-embedded on the next pass (their meta no longer matches). */
  updateSettings(settings: SemanticSettings): void {
    this.settings = settings;
    this.provider = this.providerFactory(settings);
  }

  /**
   * Cancel any in-flight pass, stop accepting work, and RESOLVE once the
   * current batch has settled. `teardown()` awaits this BEFORE closing the
   * DB so an in-flight `embedBatch` can never write to a closed store.
   *
   * The batch loop checks `this.disposed` between batches and right after
   * each `provider.embed`, so awaiting `activePass` is bounded by one
   * batch (≤ BATCH_SIZE embeds), not the whole vault.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.cancelRequested = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingPaths.clear();
    const pass = this.activePass;
    if (pass) {
      try {
        await pass;
      } catch {
        // The pass swallows its own store errors; this is belt-and-braces.
      }
    }
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  // ---- change hooks (called from the save/rename/delete pipeline) -----

  /** Enqueue a (re)embed for a note that was created or saved. Debounced. */
  enqueue(path: NotePath): void {
    if (this.disposed || !this.settings.enabled) return;
    this.pendingPaths.add(path);
    this.scheduleFlush();
  }

  /** Drop a note's embedding immediately (note deleted). Always safe. */
  async remove(path: NotePath): Promise<void> {
    this.pendingPaths.delete(path);
    if (this.store.deleteEmbedding) {
      try {
        await this.store.deleteEmbedding(path);
      } catch {
        // The store is a cache; a failed delete just leaves an orphan row
        // that the INNER JOIN in getAllEmbeddings already filters out.
      }
    }
  }

  /** Move an embedding from one path to another (rename). We re-embed the
   *  destination on the next flush and drop the source now. */
  async rename(from: NotePath, to: NotePath): Promise<void> {
    await this.remove(from);
    this.enqueue(to);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flushPending();
    }, DEBOUNCE_MS);
  }

  /** Embed everything queued since the last flush. */
  private async flushPending(): Promise<void> {
    if (this.disposed || !this.settings.enabled || this.running) {
      // If a full pass is running it will pick these up via the skip check;
      // re-arm so we don't lose them.
      if (this.pendingPaths.size > 0 && !this.disposed) this.scheduleFlush();
      return;
    }
    const paths = [...this.pendingPaths];
    this.pendingPaths.clear();
    if (paths.length === 0) return;
    await this.embedPaths(paths, false);
  }

  // ---- full / on-demand pass -----------------------------------------

  /**
   * Full pass over the vault. `force` ignores the unchanged-skip check
   * (used by reindex after a model change). Emits progress; honors cancel.
   * Returns silently — callers fire-and-forget; status is observable via
   * events / getStatus.
   */
  async runFullPass(force = false): Promise<void> {
    if (this.disposed || !this.settings.enabled || this.running) return;
    let paths: NotePath[];
    try {
      paths = await this.listPaths();
    } catch {
      return;
    }
    await this.embedPaths(paths, force);
  }

  /** Cancel an in-flight full pass. The loop checks between batches. */
  cancel(): void {
    if (this.running) this.cancelRequested = true;
  }

  private async embedPaths(paths: NotePath[], force: boolean): Promise<void> {
    // Track the pass so dispose() can await it before the DB closes.
    const pass = this.runPass(paths, force);
    this.activePass = pass;
    try {
      await pass;
    } finally {
      if (this.activePass === pass) this.activePass = null;
    }
  }

  private async runPass(paths: NotePath[], force: boolean): Promise<void> {
    this.running = true;
    this.cancelRequested = false;
    await this.emitProgress();

    try {
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        if (this.cancelRequested || this.disposed) break;
        const batch = paths.slice(i, i + BATCH_SIZE);
        await this.embedBatch(batch, force);
        // Yield to the event loop so IPC / UI stays responsive on big vaults.
        await this.emitProgress();
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      this.running = false;
      this.cancelRequested = false;
      // Skip the progress emit once disposed — the window may be tearing
      // down and getEmbeddingCounts would hit a closing DB.
      if (!this.disposed) await this.emitProgress();
    }
  }

  private async embedBatch(batch: NotePath[], force: boolean): Promise<void> {
    // Decide which notes actually need embedding (skip unchanged).
    const toEmbed: Array<{ path: NotePath; title: string; text: string; hash: string }> = [];
    for (const path of batch) {
      let loaded: { title: string; body: string } | null;
      try {
        loaded = await this.loadBody(path);
      } catch {
        continue;
      }
      if (!loaded) continue;
      const text = prepareEmbedText(loaded.title, loaded.body);
      if (text.trim() === '') {
        // Empty note: ensure no stale embedding lingers.
        await this.remove(path);
        continue;
      }
      const hash = hashContent(text);
      if (!force && this.store.getEmbeddingMeta) {
        const meta = await this.store.getEmbeddingMeta(path).catch(() => null);
        if (meta && meta.contentHash === hash && meta.modelId === this.provider.id) {
          continue; // unchanged content + same model → skip
        }
      }
      toEmbed.push({ path, title: loaded.title, text, hash });
    }
    if (toEmbed.length === 0) return;

    let vectors: Float32Array[];
    try {
      vectors = await this.provider.embed(toEmbed.map((t) => t.text));
      this.providerOk = true;
    } catch {
      // Provider unreachable: stop the pass (retrying every note would just
      // hammer a dead daemon). Mark not-ok so the UI can prompt the user.
      this.providerOk = false;
      this.cancelRequested = true;
      return;
    }

    // The embed call is the long await where a vault switch most likely
    // lands. If we were disposed while it ran, the DB is about to close (or
    // already has) — bail BEFORE the upsert loop so we don't write to a
    // closed store.
    if (this.disposed) return;

    if (!this.store.upsertEmbedding) return;
    for (let i = 0; i < toEmbed.length; i++) {
      if (this.disposed) return;
      const item = toEmbed[i]!;
      const vec = vectors[i];
      if (!vec || vec.length === 0) continue;
      try {
        await this.store.upsertEmbedding({
          sourcePath: item.path,
          title: '', // joined from notes on read
          contentHash: item.hash,
          modelId: this.provider.id,
          dim: vec.length,
          vector: vec,
          mtimeMs: Date.now(),
        });
      } catch {
        // Best-effort: a closed-DB throw (vault switched out from under us)
        // or a transient write error just skips this note. The store is a
        // cache — the next pass re-embeds it.
      }
    }
  }

  // ---- search ---------------------------------------------------------

  /**
   * Embed the query, brute-force cosine over stored vectors, return top-K
   * with snippets. Returns a typed degradation reason on every failure path
   * — never throws across IPC.
   */
  async search(
    query: string,
    limit: number,
  ): Promise<
    | { ok: true; hits: SemanticHit[] }
    | {
        ok: false;
        reason: 'disabled' | 'provider-unreachable' | 'not-indexed' | 'error';
        message: string;
      }
  > {
    if (!this.settings.enabled) {
      return { ok: false, reason: 'disabled', message: 'La ricerca semantica è disattivata.' };
    }
    if (!this.store.getAllEmbeddings) {
      return { ok: false, reason: 'error', message: 'Indice embeddings non disponibile.' };
    }
    const trimmed = query.trim();
    if (trimmed === '') return { ok: true, hits: [] };

    let rows;
    try {
      rows = await this.store.getAllEmbeddings();
    } catch {
      return { ok: false, reason: 'error', message: 'Lettura indice embeddings fallita.' };
    }
    if (rows.length === 0) {
      return {
        ok: false,
        reason: 'not-indexed',
        message: 'Nessuna nota ancora indicizzata. Avvia la reindicizzazione.',
      };
    }

    let queryVec: Float32Array;
    try {
      const [v] = await this.provider.embed([trimmed]);
      if (!v) throw new Error('empty embedding');
      queryVec = v;
      this.providerOk = true;
    } catch {
      this.providerOk = false;
      return {
        ok: false,
        reason: 'provider-unreachable',
        message: 'Ollama non è raggiungibile. Avvialo per usare la ricerca semantica.',
      };
    }

    const embRows = rows.map((r) => ({
      path: r.sourcePath,
      title: r.title,
      contentHash: r.contentHash,
      modelId: r.modelId,
      dim: r.dim,
      vector: r.vector,
      mtimeMs: r.mtimeMs,
    }));
    const ranked = rankBySimilarity(queryVec, embRows, limit);
    const hits = await this.attachSnippets(ranked);
    return { ok: true, hits };
  }

  /** Pull a short body excerpt for each hit. Best-effort; a failed read
   *  just yields an empty snippet rather than dropping the hit. */
  private async attachSnippets(hits: SemanticHit[]): Promise<SemanticHit[]> {
    const out: SemanticHit[] = [];
    for (const hit of hits) {
      let snippet = '';
      try {
        const loaded = await this.loadBody(hit.path);
        if (loaded) {
          const body = loaded.body.replace(/\s+/g, ' ').trim();
          snippet = body.length > SNIPPET_CHARS ? `${body.slice(0, SNIPPET_CHARS)}…` : body;
        }
      } catch {
        // leave empty
      }
      out.push({ ...hit, snippet });
    }
    return out;
  }

  // ---- status ---------------------------------------------------------

  async getStatus(): Promise<EmbeddingStatus> {
    let indexed = 0;
    let total = 0;
    if (this.store.getEmbeddingCounts) {
      try {
        const c = await this.store.getEmbeddingCounts();
        indexed = c.indexed;
        total = c.total;
      } catch {
        // counts are best-effort
      }
    }
    let providerOk = this.providerOk;
    // Active health check when enabled so the UI reflects reality even
    // before the first embed call. Cheap (/api/tags); never throws.
    if (this.settings.enabled && this.provider instanceof OllamaEmbeddingProvider) {
      providerOk = await this.provider.ping();
      this.providerOk = providerOk;
    }
    return {
      enabled: this.settings.enabled,
      indexed,
      total,
      running: this.running,
      providerOk,
      modelId: this.provider.id,
    };
  }

  private async emitProgress(): Promise<void> {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    let indexed = 0;
    let total = 0;
    if (this.store.getEmbeddingCounts) {
      try {
        const c = await this.store.getEmbeddingCounts();
        indexed = c.indexed;
        total = c.total;
      } catch {
        // ignore
      }
    }
    const payload: EmbeddingProgressPayload = {
      indexed,
      total,
      running: this.running,
      providerOk: this.providerOk,
    };
    win.webContents.send(IpcChannels.embeddingProgress, payload);
  }
}

/** Build the concrete provider from settings. Currently Ollama-only. */
function buildProvider(settings: SemanticSettings): EmbeddingProvider {
  return new OllamaEmbeddingProvider({ baseUrl: settings.baseUrl, model: settings.model });
}
