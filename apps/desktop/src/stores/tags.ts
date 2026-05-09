import type { NoteSummary } from '@ziba/core';
import { create } from 'zustand';
import type { TagSummary } from '../../shared/ipc';
import { debounce } from '../lib/debounce';
import { ipc } from '../lib/ipc';
import { useVaultStore } from './vault';

/**
 * Trailing-edge debounce for tag-list refreshes triggered by watcher
 * events. 200ms — slightly longer than the vault store's own 150ms refresh
 * so the SQLite tags index has settled by the time we re-list it. Cheap to
 * tweak from one place if the sidebar feels stale.
 */
const TAGS_REFRESH_DEBOUNCE_MS = 200;

type TagsState = {
  /** All distinct tags in the vault, sorted by count desc / name asc (server-side). */
  tags: TagSummary[];
  /** Canonical (lowercase) tag the user is filtering by, or null. */
  selectedTag: string | null;
  /** Notes that contain `selectedTag`, fetched lazily on selection. */
  notesForSelectedTag: NoteSummary[];
  /** True while either the listing or the per-tag fetch is in flight. */
  loading: boolean;

  refresh(): Promise<void>;
  selectTag(tag: string | null): Promise<void>;
  /** Trailing-edge refresh for watcher bursts. Same coalescing pattern as `useVaultStore`. */
  applyVaultEvent(): void;
};

/**
 * Zustand store mirroring the vault-side tags index for the sidebar UI.
 *
 * Lifecycle:
 *   - On vault open / switch, `refresh()` lists all tags and `selectTag(null)`
 *     clears any prior filter. Both hooks fire from the `useVaultStore`
 *     subscription installed at the bottom of this file.
 *   - On watcher events, `useVaultStore` already debounces a `notes` refresh
 *     by 150ms; we piggyback by subscribing to `notes` changes and running
 *     our own 200ms debounce on top so the tag list mirrors the vault.
 *   - When the user picks a tag, we fetch the matching `NoteSummary[]`
 *     once. Subsequent vault events refetch lazily (a refresh after a
 *     debounced burst pulls a fresh list).
 *
 * Concurrency:
 *   - `selectTag` uses a request sequence so rapid clicks land the freshest
 *     result. The pattern matches `useSearchStore`.
 */
export const useTagsStore = create<TagsState>((set, get) => {
  // Sequence number drops late responses when the user clicks tags fast.
  let selectionSeq = 0;

  const debouncedRefresh = debounce((): void => {
    void get().refresh();
  }, TAGS_REFRESH_DEBOUNCE_MS);

  return {
    tags: [],
    selectedTag: null,
    notesForSelectedTag: [],
    loading: false,

    async refresh() {
      // Skip if no vault open — IPC would throw and we'd have to swallow it.
      if (useVaultStore.getState().current === null) {
        set({ tags: [], notesForSelectedTag: [], selectedTag: null });
        return;
      }
      try {
        set({ loading: true });
        const tags = await ipc.listTags();
        // If the previously-selected tag has disappeared from the index
        // (last note containing it was deleted / renamed), drop the filter.
        const selected = get().selectedTag;
        const stillExists = selected !== null && tags.some((t) => t.tag === selected);
        if (selected !== null && !stillExists) {
          set({ tags, selectedTag: null, notesForSelectedTag: [], loading: false });
          return;
        }
        set({ tags, loading: false });
        // If a tag is still selected, refresh the per-tag note list so a
        // freshly-tagged or renamed note surfaces without an extra click.
        if (selected !== null) {
          const seq = ++selectionSeq;
          const notes = await ipc.getNotesByTag({ tag: selected });
          if (seq === selectionSeq) {
            set({ notesForSelectedTag: notes });
          }
        }
      } catch {
        // Tags are an enrichment surface; failing silently keeps the
        // sidebar usable. The user can retry by switching vault or
        // triggering a watcher event.
        set({ loading: false });
      }
    },

    async selectTag(tag) {
      // Cancel in-flight refetches first — selecting null should clear,
      // not race the previous request.
      const seq = ++selectionSeq;
      if (tag === null) {
        set({ selectedTag: null, notesForSelectedTag: [] });
        return;
      }
      set({ selectedTag: tag, loading: true });
      try {
        const notes = await ipc.getNotesByTag({ tag });
        if (seq !== selectionSeq) return;
        set({ notesForSelectedTag: notes, loading: false });
      } catch {
        if (seq !== selectionSeq) return;
        set({ notesForSelectedTag: [], loading: false });
      }
    },

    applyVaultEvent() {
      debouncedRefresh();
    },
  };
});

// ---- Vault-store wiring ---------------------------------------------------
//
// Subscribe to two slices of `useVaultStore`:
//   1. `current.root` — when the user switches vaults, reset the filter and
//      refresh the tag list from scratch.
//   2. `notes` reference — `useVaultStore` already debounces a re-list after
//      watcher events; that's our cheapest signal that "something changed on
//      disk". We re-run our own debounced refresh on top so several
//      notes-list updates coalesce into a single tags listing.
//
// The subscription is installed module-side (not inside the store factory)
// so it attaches once at module load. React consumers of `useTagsStore`
// don't have to wire anything up.
if (typeof window !== 'undefined') {
  let lastVaultRoot: string | null = useVaultStore.getState().current?.root ?? null;
  let lastNotesRef = useVaultStore.getState().notes;

  useVaultStore.subscribe((state) => {
    const vaultRoot = state.current?.root ?? null;

    if (vaultRoot !== lastVaultRoot) {
      lastVaultRoot = vaultRoot;
      lastNotesRef = state.notes;
      // Clear the filter and refresh on vault switch (or close). We don't
      // also schedule the debounced refresh — `refresh()` runs immediately.
      void useTagsStore.getState().selectTag(null);
      void useTagsStore.getState().refresh();
      return;
    }

    // Same vault — only react when the `notes` reference actually changed
    // (the vault store reassigns it after each `refreshNotes()`). This
    // skips spurious notifications from unrelated fields like
    // `indexProgress` or `recentVaults`.
    if (state.notes !== lastNotesRef) {
      lastNotesRef = state.notes;
      useTagsStore.getState().applyVaultEvent();
    }
  });
}
