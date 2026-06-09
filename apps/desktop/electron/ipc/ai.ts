// IPC handlers for semantic search (milestone 1).
//
// Every handler degrades gracefully: when the feature is off, no vault is
// open, or Ollama is down, they return a typed "not ok" / default status
// rather than throwing — so the renderer never has to catch to stay alive.

import type { EmbeddingStatus, SemanticSettings } from '@ziba/core';
import type { SemanticSearchResult } from '../../shared/ipc.js';
import { getEmbeddingIndexer } from '../state.js';
import { getSemanticSettings, setSemanticSettings } from './settings.js';

const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 50;

export async function semanticSearch(args: {
  query: string;
  limit?: number;
}): Promise<SemanticSearchResult> {
  const indexer = getEmbeddingIndexer();
  if (!indexer) {
    return { ok: false, reason: 'disabled', message: 'Nessun vault aperto.' };
  }
  const limit = Math.max(1, Math.min(args.limit ?? SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX));
  return indexer.search(args.query, limit);
}

export async function getEmbeddingStatus(): Promise<EmbeddingStatus> {
  const indexer = getEmbeddingIndexer();
  if (!indexer) {
    // No vault open: report a safe disabled snapshot.
    const settings = await getSemanticSettings();
    return {
      enabled: settings.enabled,
      indexed: 0,
      total: 0,
      running: false,
      providerOk: false,
      modelId: `ollama:${settings.model}`,
    };
  }
  return indexer.getStatus();
}

export async function reindexEmbeddings(): Promise<{ started: boolean }> {
  const indexer = getEmbeddingIndexer();
  if (!indexer || !indexer.isEnabled()) return { started: false };
  // Force a full rebuild (ignore the unchanged-skip), fire-and-forget so the
  // IPC call returns immediately; progress streams over `embeddingProgress`.
  void indexer.runFullPass(true);
  return { started: true };
}

export async function getSemanticSettingsHandler(): Promise<SemanticSettings> {
  return getSemanticSettings();
}

/**
 * Persist new provider settings and reconfigure the live indexer. Toggling
 * `enabled` on kicks off a full pass; toggling off cancels any in-flight
 * pass. Returns the merged, validated settings.
 */
export async function setSemanticSettingsHandler(args: {
  settings: Partial<SemanticSettings>;
}): Promise<SemanticSettings> {
  const before = await getSemanticSettings();
  const next = await setSemanticSettings(args.settings ?? {});
  const indexer = getEmbeddingIndexer();
  if (indexer) {
    indexer.updateSettings(next);
    const turnedOn = !before.enabled && next.enabled;
    const modelChanged = before.model !== next.model || before.baseUrl !== next.baseUrl;
    if (!next.enabled) {
      indexer.cancel();
    } else if (turnedOn || modelChanged) {
      // New model/URL means stored vectors may be stale (different model_id)
      // — a full pass re-embeds what's changed and skips what isn't.
      void indexer.runFullPass(modelChanged);
    }
  }
  return next;
}
