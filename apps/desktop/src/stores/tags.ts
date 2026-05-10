import type { NoteSummary } from '@ziba/core';
import { create } from 'zustand';
import type { ObjectTypeRow, TagSummary, TypeCountRow } from '../../shared/ipc';
import { debounce } from '../lib/debounce';
import { ipc } from '../lib/ipc';
import { useVaultStore } from './vault';

/**
 * Trailing-edge debounce for taxonomy refreshes triggered by watcher
 * events. 200ms — slightly longer than the vault store's own 150ms refresh
 * so the SQLite tags / properties / object_types indexes have settled by
 * the time we re-list them. Cheap to tweak from one place if the sidebar
 * feels stale.
 */
const TAGS_REFRESH_DEBOUNCE_MS = 200;

/**
 * v1.0: a sidebar-ready type entry. Combines the count from
 * `getTypeCounts()` (notes-on-disk) with the optional metadata from
 * `listObjectTypes()` (schemas in `<vault>/.ziba/schema/`). Schemas are
 * optional — a note can declare `type: foobar` even without a matching
 * `foobar.yml`, in which case label = id, icon/color = null.
 */
export type TypeSummary = {
  id: string;
  label: string;
  icon: string | null;
  color: string | null;
  count: number;
};

type TagsState = {
  /** All distinct tags in the vault, sorted by count desc / name asc (server-side). */
  tags: TagSummary[];
  /**
   * v1.0: all distinct types in the vault. Sorted by count desc /
   * label asc. Includes only types that appear on at least one note's
   * frontmatter (a schema with no users does not show up).
   */
  types: TypeSummary[];

  /** Canonical (lowercase) tag the user is filtering by, or null. */
  selectedTag: string | null;
  /** v1.0: type slug the user is filtering by, or null. Mutually exclusive with selectedTag. */
  selectedType: string | null;

  /** Notes that contain `selectedTag`, fetched lazily on selection. */
  notesForSelectedTag: NoteSummary[];
  /** v1.0: notes whose `type:` matches `selectedType`, fetched lazily. */
  notesForSelectedType: NoteSummary[];

  /** True while either listing or per-selection fetch is in flight. */
  loading: boolean;

  refresh(): Promise<void>;
  selectTag(tag: string | null): Promise<void>;
  selectType(type: string | null): Promise<void>;
  /** Trailing-edge refresh for watcher bursts. */
  applyVaultEvent(): void;
};

/**
 * Zustand store mirroring the vault-side taxonomy (tags + v1.0 types)
 * for the sidebar UI.
 *
 * Lifecycle:
 *   - On vault open / switch, `refresh()` fetches tags + types and
 *     `select{Tag,Type}(null)` clears any prior filter.
 *   - On watcher events, `useVaultStore` already debounces a `notes`
 *     refresh by 150ms; we piggyback by subscribing to `notes`
 *     changes and running our own 200ms debounce on top so multiple
 *     notes-list updates coalesce into a single taxonomy listing.
 *   - When the user picks a tag or type, we fetch the matching
 *     `NoteSummary[]` once. Subsequent vault events refetch lazily.
 *
 * Mutual exclusion:
 *   - `selectTag(non-null)` resets `selectedType` to null and clears
 *     `notesForSelectedType`. Vice versa for `selectType`. The two
 *     filters are never simultaneously active — the sidebar consumes
 *     whichever is non-null. Union-of-filters is a v1.1 follow-up.
 *
 * Concurrency:
 *   - `select{Tag,Type}` use a shared request sequence so rapid clicks
 *     across both surfaces still land the freshest result. The pattern
 *     matches `useSearchStore`.
 */
export const useTagsStore = create<TagsState>((set, get) => {
  // Single sequence covers both selectTag and selectType so a fast
  // tag→type→tag toggle can't land an out-of-order response.
  let selectionSeq = 0;

  const debouncedRefresh = debounce((): void => {
    void get().refresh();
  }, TAGS_REFRESH_DEBOUNCE_MS);

  // Pure helper: merge type counts with their schemas to produce a
  // sidebar-ready list. Schemas without users are dropped (mirrors the
  // tag listing which only shows tags with count > 0).
  function buildTypeSummaries(counts: TypeCountRow[], schemas: ObjectTypeRow[]): TypeSummary[] {
    const schemaById = new Map(schemas.map((s) => [s.id, s]));
    return counts.map((c) => {
      const schema = schemaById.get(c.type);
      return {
        id: c.type,
        label: schema?.label ?? c.type,
        icon: schema?.icon ?? null,
        color: schema?.color ?? null,
        count: c.count,
      };
    });
  }

  return {
    tags: [],
    types: [],
    selectedTag: null,
    selectedType: null,
    notesForSelectedTag: [],
    notesForSelectedType: [],
    loading: false,

    async refresh() {
      if (useVaultStore.getState().current === null) {
        set({
          tags: [],
          types: [],
          selectedTag: null,
          selectedType: null,
          notesForSelectedTag: [],
          notesForSelectedType: [],
        });
        return;
      }
      try {
        set({ loading: true });
        const [tags, typeCounts, typeSchemas] = await Promise.all([
          ipc.listTags(),
          ipc.getTypeCounts(),
          ipc.listObjectTypes(),
        ]);
        const types = buildTypeSummaries(typeCounts, typeSchemas);

        const selectedTag = get().selectedTag;
        const selectedType = get().selectedType;

        // Drop a stale tag filter (the last note carrying it was
        // deleted or renamed away from this tag).
        const tagStillExists = selectedTag !== null && tags.some((t) => t.tag === selectedTag);
        // Same for type.
        const typeStillExists = selectedType !== null && types.some((t) => t.id === selectedType);

        const update: Partial<TagsState> = { tags, types, loading: false };
        if (selectedTag !== null && !tagStillExists) {
          update.selectedTag = null;
          update.notesForSelectedTag = [];
        }
        if (selectedType !== null && !typeStillExists) {
          update.selectedType = null;
          update.notesForSelectedType = [];
        }
        set(update);

        // If a filter is still active, refresh its per-selection list
        // so a freshly-tagged / freshly-typed note surfaces without an
        // extra click.
        if (selectedTag !== null && tagStillExists) {
          const seq = ++selectionSeq;
          const notes = await ipc.getNotesByTag({ tag: selectedTag });
          if (seq === selectionSeq) set({ notesForSelectedTag: notes });
        }
        if (selectedType !== null && typeStillExists) {
          const seq = ++selectionSeq;
          // Notes-by-type is a database query: filter on the `type`
          // property exactly. We could expose a dedicated IPC, but
          // runDatabaseQuery already supports the shape and avoids
          // adding API surface for one more call site.
          const result = await ipc.runDatabaseQuery({
            query: { filters: [{ kind: 'eq', key: 'type', value: selectedType }] },
          });
          if (seq === selectionSeq) {
            set({
              notesForSelectedType: result.rows.map((r) => ({
                path: r.path,
                title: r.title,
                mtimeMs: r.mtimeMs,
              })),
            });
          }
        }
      } catch {
        // Taxonomy is an enrichment surface; failing silently keeps
        // the sidebar usable. The user can retry by switching vault
        // or triggering a watcher event.
        set({ loading: false });
      }
    },

    async selectTag(tag) {
      const seq = ++selectionSeq;
      if (tag === null) {
        set({ selectedTag: null, notesForSelectedTag: [] });
        return;
      }
      // Mutual exclusion: clear the type filter when a tag is chosen.
      set({
        selectedTag: tag,
        selectedType: null,
        notesForSelectedType: [],
        loading: true,
      });
      try {
        const notes = await ipc.getNotesByTag({ tag });
        if (seq !== selectionSeq) return;
        set({ notesForSelectedTag: notes, loading: false });
      } catch {
        if (seq !== selectionSeq) return;
        set({ notesForSelectedTag: [], loading: false });
      }
    },

    async selectType(type) {
      const seq = ++selectionSeq;
      if (type === null) {
        set({ selectedType: null, notesForSelectedType: [] });
        return;
      }
      // Mutual exclusion: clear the tag filter.
      set({
        selectedType: type,
        selectedTag: null,
        notesForSelectedTag: [],
        loading: true,
      });
      try {
        const result = await ipc.runDatabaseQuery({
          query: { filters: [{ kind: 'eq', key: 'type', value: type }] },
        });
        if (seq !== selectionSeq) return;
        set({
          notesForSelectedType: result.rows.map((r) => ({
            path: r.path,
            title: r.title,
            mtimeMs: r.mtimeMs,
          })),
          loading: false,
        });
      } catch {
        if (seq !== selectionSeq) return;
        set({ notesForSelectedType: [], loading: false });
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
//      refresh the taxonomy from scratch.
//   2. `notes` reference — `useVaultStore` already debounces a re-list after
//      watcher events; that's our cheapest signal that "something changed on
//      disk". We re-run our own debounced refresh on top so several
//      notes-list updates coalesce into a single taxonomy listing.
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
      void useTagsStore.getState().selectTag(null);
      void useTagsStore.getState().selectType(null);
      void useTagsStore.getState().refresh();
      return;
    }

    if (state.notes !== lastNotesRef) {
      lastNotesRef = state.notes;
      useTagsStore.getState().applyVaultEvent();
    }
  });
}
