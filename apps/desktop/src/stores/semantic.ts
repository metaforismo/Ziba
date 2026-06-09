import { create } from 'zustand';
import type { EmbeddingStatus, SemanticSettings } from '@ziba/core';
import type { EmbeddingProgressPayload } from '../../shared/ipc';
import { ipc } from '../lib/ipc';
import { ipcErrorMessage } from '../lib/ipc-error';

// Renderer-side state for the semantic-search settings panel: the persisted
// provider config + a live status snapshot (indexed/total, providerOk,
// running). Status is refreshed on open and kept current by the
// `embeddingProgress` push stream wired in App.tsx.

const DEFAULT_STATUS: EmbeddingStatus = {
  enabled: false,
  indexed: 0,
  total: 0,
  running: false,
  providerOk: false,
  modelId: '',
};

type SemanticState = {
  open: boolean;
  settings: SemanticSettings | null;
  status: EmbeddingStatus;
  loading: boolean;
  saving: boolean;
  error: string | null;

  openPanel(): void;
  closePanel(): void;
  refresh(): Promise<void>;
  save(patch: Partial<SemanticSettings>): Promise<void>;
  reindex(): Promise<void>;
  applyProgress(p: EmbeddingProgressPayload): void;
};

export const useSemanticStore = create<SemanticState>((set, get) => ({
  open: false,
  settings: null,
  status: DEFAULT_STATUS,
  loading: false,
  saving: false,
  error: null,

  openPanel() {
    set({ open: true, error: null });
    void get().refresh();
  },

  closePanel() {
    set({ open: false });
  },

  async refresh() {
    set({ loading: true, error: null });
    try {
      const [settings, status] = await Promise.all([
        ipc.getSemanticSettings(),
        ipc.getEmbeddingStatus(),
      ]);
      set({ settings, status, loading: false });
    } catch (err: unknown) {
      set({ loading: false, error: ipcErrorMessage(err) });
    }
  },

  async save(patch) {
    set({ saving: true, error: null });
    try {
      const settings = await ipc.setSemanticSettings({ settings: patch });
      set({ settings, saving: false });
      // Pull a fresh status: toggling on triggers a pass / health check.
      const status = await ipc.getEmbeddingStatus();
      set({ status });
    } catch (err: unknown) {
      set({ saving: false, error: ipcErrorMessage(err) });
    }
  },

  async reindex() {
    set({ error: null });
    try {
      await ipc.reindexEmbeddings();
      const status = await ipc.getEmbeddingStatus();
      set({ status });
    } catch (err: unknown) {
      set({ error: ipcErrorMessage(err) });
    }
  },

  applyProgress(p) {
    set((s) => ({
      status: {
        ...s.status,
        indexed: p.indexed,
        total: p.total,
        running: p.running,
        providerOk: p.providerOk,
      },
    }));
  },
}));
