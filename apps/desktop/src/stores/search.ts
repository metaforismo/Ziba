import { create } from 'zustand';
import type { SearchHit } from '../../shared/ipc';
import { debounce } from '../lib/debounce';
import { ipc } from '../lib/ipc';
import { ipcErrorMessage } from '../lib/ipc-error';
import { SEARCH_DEBOUNCE_MS } from '../lib/timings';
import { useEditorStore } from './editor';

/** Maximum hits returned by a single FTS5 query — keeps the palette list
 *  bounded and the snippet rendering work small. */
const SEARCH_RESULT_LIMIT = 50;

type SearchState = {
  open: boolean;
  query: string;
  results: SearchHit[];
  selectedIndex: number;
  loading: boolean;
  error: string | null;

  openPalette(): void;
  closePalette(): void;
  setQuery(q: string): void;
  /**
   * Imperatively trigger the FTS5 lookup. Normally called by the debounced
   * scheduler in `setQuery`, but exposed so tests / future callers can
   * force a synchronous run.
   */
  runSearch(): Promise<void>;
  selectNext(): void;
  selectPrev(): void;
  /**
   * Open the currently selected hit in the editor and close the palette.
   * No-op when the result list is empty (Enter on an empty query).
   */
  chooseSelected(): Promise<void>;
};

export const useSearchStore = create<SearchState>((set, get) => {
  // Sequence number guards against out-of-order responses: rapid typing
  // can fire multiple `runSearch` calls; only the latest one is allowed
  // to update state. Same pattern as `BacklinksPanel`.
  let requestSeq = 0;

  const debouncedRun = debounce((): void => {
    void get().runSearch();
  }, SEARCH_DEBOUNCE_MS);

  return {
    open: false,
    query: '',
    results: [],
    selectedIndex: 0,
    loading: false,
    error: null,

    openPalette() {
      // Re-opening the palette resets transient UI state but keeps the
      // last query so users can reuse it. The IPC call is throttled
      // through the debouncer so a quick toggle won't double-fire.
      set({ open: true, error: null, selectedIndex: 0 });
    },

    closePalette() {
      // Cancel any in-flight debounced search and bump the sequence so
      // late-arriving responses are dropped. Clearing results+query
      // matches the user's mental model of "the palette is gone".
      debouncedRun.cancel();
      requestSeq++;
      set({
        open: false,
        query: '',
        results: [],
        selectedIndex: 0,
        loading: false,
        error: null,
      });
    },

    setQuery(q) {
      // Update the input synchronously so typing feels native, then let
      // the debouncer schedule the actual search. Empty queries clear
      // results immediately — no point in waiting 150ms for an empty
      // round-trip.
      const trimmed = q.trim();
      if (trimmed === '') {
        debouncedRun.cancel();
        requestSeq++;
        set({ query: q, results: [], loading: false, error: null, selectedIndex: 0 });
        return;
      }
      set({ query: q, loading: true, error: null, selectedIndex: 0 });
      debouncedRun();
    },

    async runSearch() {
      const query = get().query.trim();
      if (query === '') {
        set({ results: [], loading: false, error: null });
        return;
      }
      const seq = ++requestSeq;
      try {
        const results = await ipc.searchFullText({ query, limit: SEARCH_RESULT_LIMIT });
        if (seq !== requestSeq) return;
        set({ results, loading: false, error: null, selectedIndex: 0 });
      } catch (err: unknown) {
        if (seq !== requestSeq) return;
        const message = ipcErrorMessage(err);
        set({ results: [], loading: false, error: message });
      }
    },

    selectNext() {
      const { results, selectedIndex } = get();
      if (results.length === 0) return;
      // Wrap to the top so users can keep pressing ArrowDown without
      // hitting a dead end at the bottom of a long list.
      const next = (selectedIndex + 1) % results.length;
      set({ selectedIndex: next });
    },

    selectPrev() {
      const { results, selectedIndex } = get();
      if (results.length === 0) return;
      const prev = (selectedIndex - 1 + results.length) % results.length;
      set({ selectedIndex: prev });
    },

    async chooseSelected() {
      const { results, selectedIndex } = get();
      if (results.length === 0) return;
      const hit = results[selectedIndex];
      if (hit === undefined) return;
      // Close the palette first so its `Escape`/keydown listeners detach
      // before the editor takes focus — avoids a flash where the
      // closing palette swallows the editor's mount transitions.
      get().closePalette();
      await useEditorStore.getState().openNote(hit.path);
    },
  };
});
