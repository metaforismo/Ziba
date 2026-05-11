import { create } from 'zustand';
import type { DatabaseQuery, DatabaseResult, ScalarFilter } from '../../shared/ipc';
import { debounce } from '../lib/debounce';
import { ipc } from '../lib/ipc';
import { ipcErrorMessage } from '../lib/ipc-error';
import { DATABASE_QUERY_DEBOUNCE_MS } from '../lib/timings';
import { useVaultStore } from './vault';

/**
 * Hard cap on rows returned by the v0.3 table view. Mirrors the adapter's
 * server-side default; surfaced here so the UI knows when to render the
 * "shown of total" hint and stays consistent if the server cap changes.
 */
const DEFAULT_QUERY_LIMIT = 1000;

type DatabaseState = {
  /** Current query — single source of truth for filters/sort/groupBy/folder. */
  query: DatabaseQuery;
  result: DatabaseResult | null;
  loading: boolean;
  error: string | null;
  /** Property keys currently observable in `result.rows`, sorted alphabetically. */
  availableProperties: string[];
  /** Last-update timestamp (ms since epoch) of a successful query. */
  lastUpdatedAt: number | null;
  /**
   * v1.0 Phase 4: page-level type filter. When non-null, runQuery
   * prepends `{ kind: 'eq', key: 'type', value: selectedType }` to
   * the outgoing IPC filter list. Kept out of `query.filters` so the
   * FilterBar doesn't render a redundant chip for the page-level
   * scope.
   */
  selectedType: string | null;

  // ---- Filter actions ----------------------------------------------------
  setFilters(filters: ScalarFilter[]): void;
  addFilter(filter: ScalarFilter): void;
  removeFilter(index: number): void;
  updateFilter(index: number, filter: ScalarFilter): void;

  // ---- Other query knobs -------------------------------------------------
  setSort(sort: DatabaseQuery['sort']): void;
  setGroupBy(key: string | null): void;
  setFolder(folder: string | undefined): void;
  /** v1.0 Phase 4: set or clear the page-level type filter. */
  setType(type: string | null): void;

  // ---- Execution ---------------------------------------------------------
  /** Run the query immediately. Cancels any pending debounced run. */
  runQuery(): Promise<void>;
  /** Subscribe to vault-store note-list changes and re-run debounced. */
  subscribeToVaultEvents(): () => void;
};

function deriveAvailableProperties(result: DatabaseResult | null): string[] {
  if (result === null) return [];
  const seen = new Set<string>();
  for (const row of result.rows) {
    for (const key of Object.keys(row.properties)) {
      seen.add(key);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

const INITIAL_QUERY: DatabaseQuery = {
  filters: [],
  limit: DEFAULT_QUERY_LIMIT,
};

export const useDatabaseStore = create<DatabaseState>((set, get) => {
  // Sequence number drops late responses when the user mutates the query
  // faster than the IPC round-trip — same pattern as `useSearchStore`.
  let requestSeq = 0;

  // Trailing-edge debounce on every query knob change. Mutating multiple
  // filters in quick succession (e.g. typing a value into a text input)
  // should land a single SQLite query.
  const debouncedRun = debounce((): void => {
    void get().runQuery();
  }, DATABASE_QUERY_DEBOUNCE_MS);

  /**
   * Schedule a re-run after a state mutation. We always cancel-and-rearm
   * so the most recent edit wins; the user can always force an immediate
   * run via `runQuery()` directly.
   */
  const scheduleRun = (): void => {
    set({ loading: true });
    debouncedRun();
  };

  return {
    query: INITIAL_QUERY,
    result: null,
    loading: false,
    error: null,
    availableProperties: [],
    lastUpdatedAt: null,
    selectedType: null,

    setFilters(filters) {
      set({ query: { ...get().query, filters } });
      scheduleRun();
    },

    addFilter(filter) {
      const cur = get().query.filters ?? [];
      set({ query: { ...get().query, filters: [...cur, filter] } });
      scheduleRun();
    },

    removeFilter(index) {
      const cur = get().query.filters ?? [];
      if (index < 0 || index >= cur.length) return;
      const next = cur.slice(0, index).concat(cur.slice(index + 1));
      set({ query: { ...get().query, filters: next } });
      scheduleRun();
    },

    updateFilter(index, filter) {
      const cur = get().query.filters ?? [];
      if (index < 0 || index >= cur.length) return;
      const next = cur.slice();
      next[index] = filter;
      set({ query: { ...get().query, filters: next } });
      scheduleRun();
    },

    setSort(sort) {
      const next: DatabaseQuery = { ...get().query };
      if (sort === undefined || sort.length === 0) {
        delete next.sort;
      } else {
        next.sort = sort;
      }
      set({ query: next });
      scheduleRun();
    },

    setGroupBy(key) {
      const next: DatabaseQuery = { ...get().query };
      if (key === null) {
        delete next.groupBy;
      } else {
        next.groupBy = key;
      }
      set({ query: next });
      scheduleRun();
    },

    setFolder(folder) {
      const next: DatabaseQuery = { ...get().query };
      if (folder === undefined || folder === '') {
        delete next.folder;
      } else {
        next.folder = folder;
      }
      set({ query: next });
      scheduleRun();
    },

    setType(type) {
      set({ selectedType: type });
      scheduleRun();
    },

    async runQuery() {
      // Skip if no vault open — the IPC handler would throw and we'd have
      // to swallow it. Same guard as `useTagsStore`.
      if (useVaultStore.getState().current === null) {
        debouncedRun.cancel();
        set({
          result: null,
          loading: false,
          error: null,
          availableProperties: [],
          lastUpdatedAt: null,
        });
        return;
      }
      // Cancel any pending debounced run so we don't fire twice when a
      // caller explicitly invokes `runQuery()` after a mutation.
      debouncedRun.cancel();
      const seq = ++requestSeq;
      set({ loading: true, error: null });
      try {
        const baseQuery = get().query;
        const selectedType = get().selectedType;
        const outgoingFilters: ScalarFilter[] =
          selectedType === null
            ? (baseQuery.filters ?? [])
            : [{ kind: 'eq', key: 'type', value: selectedType }, ...(baseQuery.filters ?? [])];
        const outgoing: DatabaseQuery = { ...baseQuery, filters: outgoingFilters };
        const result = await ipc.runDatabaseQuery({ query: outgoing });
        if (seq !== requestSeq) return;
        set({
          result,
          loading: false,
          error: null,
          availableProperties: deriveAvailableProperties(result),
          lastUpdatedAt: Date.now(),
        });
      } catch (err: unknown) {
        if (seq !== requestSeq) return;
        const message = ipcErrorMessage(err);
        set({ loading: false, error: message });
      }
    },

    subscribeToVaultEvents() {
      // Snapshot the current vault root + notes-array reference so we can
      // distinguish vault-switch from in-vault changes. `useVaultStore`
      // already debounces watcher events into one `notes` re-list (150ms),
      // and we layer a 200ms debounce on top so several index updates
      // coalesce into one query run.
      let lastVaultRoot: string | null = useVaultStore.getState().current?.root ?? null;
      let lastNotesRef = useVaultStore.getState().notes;

      const unsubscribe = useVaultStore.subscribe((state) => {
        const vaultRoot = state.current?.root ?? null;

        if (vaultRoot !== lastVaultRoot) {
          lastVaultRoot = vaultRoot;
          lastNotesRef = state.notes;
          if (vaultRoot === null) {
            // Vault closed — drop in-flight requests and clear state.
            debouncedRun.cancel();
            requestSeq++;
            set({
              query: INITIAL_QUERY,
              selectedType: null,
              result: null,
              loading: false,
              error: null,
              availableProperties: [],
              lastUpdatedAt: null,
            });
            return;
          }
          // Vault opened or switched — fire an immediate query so the
          // table is populated by the time the user clicks "Database".
          void get().runQuery();
          return;
        }

        // Same vault — react only when the `notes` reference actually
        // changed (skips spurious notifications from unrelated fields
        // like `indexProgress` or `recentVaults`).
        if (state.notes !== lastNotesRef) {
          lastNotesRef = state.notes;
          scheduleRun();
        }
      });

      return unsubscribe;
    },
  };
});
