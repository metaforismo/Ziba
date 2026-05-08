import type { NoteSummary } from '@synapsium/core';
import { create } from 'zustand';
import type {
  IndexProgressPayload,
  VaultEventPayload,
  VaultInfo,
} from '../../shared/ipc';
import { debounce } from '../lib/debounce';
import { ipc } from '../lib/ipc';

type IndexProgress = { processed: number; total: number | null };

type VaultState = {
  current: VaultInfo | null;
  notes: NoteSummary[];
  recentVaults: VaultInfo[];
  indexProgress: IndexProgress | null;

  openVault(root: string): Promise<void>;
  closeVault(): Promise<void>;
  pickAndOpenVault(): Promise<VaultInfo | null>;
  refreshNotes(): Promise<void>;
  loadRecentVaults(): Promise<void>;
  setIndexProgress(p: IndexProgress | null): void;
  applyVaultEvent(e: VaultEventPayload): void;
  hydrateFromMain(): Promise<void>;
};

export const useVaultStore = create<VaultState>((set, get) => {
  // FS events arrive in bursts during a save or git pull; batch them into a
  // single index refresh on the trailing edge. The store is the single
  // owner of this debouncer so concurrent events coalesce correctly.
  const debouncedRefresh = debounce((): void => {
    void get().refreshNotes();
  }, 150);

  return {
    current: null,
    notes: [],
    recentVaults: [],
    indexProgress: null,

    async openVault(root) {
      const info = await ipc.openVault({ root });
      set({ current: info, notes: [] });
      await get().refreshNotes();
      await get().loadRecentVaults();
    },

    async closeVault() {
      await ipc.closeVault();
      set({ current: null, notes: [], indexProgress: null });
    },

    async pickAndOpenVault() {
      const picked = await ipc.pickVaultFolder({});
      if (picked === null) return null;
      await get().openVault(picked.root);
      return get().current;
    },

    async refreshNotes() {
      const current = get().current;
      if (current === null) return;
      const notes = await ipc.listNotes();
      set({ notes });
    },

    async loadRecentVaults() {
      const recentVaults = await ipc.getRecentVaults();
      set({ recentVaults });
    },

    setIndexProgress(p) {
      set({ indexProgress: p });
    },

    applyVaultEvent(_e) {
      // For Wave 2 we don't reconcile event-by-event; we just trigger a
      // debounced re-list. Wave 3+ can replace this with surgical updates
      // (find note by path, splice in/out of `notes`) once the file tree
      // gets large enough that re-listing the whole vault is noticeable.
      debouncedRefresh();
    },

    async hydrateFromMain() {
      const [current, recentVaults] = await Promise.all([
        ipc.getCurrentVault(),
        ipc.getRecentVaults(),
      ]);
      set({ current, recentVaults });
      if (current !== null) {
        await get().refreshNotes();
      }
    },
  };
});

// Convenience type so non-store code (e.g. components) can reuse the
// progress shape without re-deriving it.
export type { IndexProgress, IndexProgressPayload };
