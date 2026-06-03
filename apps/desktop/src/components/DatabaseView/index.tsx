import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Frontmatter, NotePath } from '@ziba/core';
import type {
  DatabaseGroup,
  DatabaseQuery,
  DatabaseRow,
  DatabaseViewDefinition,
  DatabaseViewsFile,
  PropertyType,
} from '../../../shared/ipc';
import { useDatabaseStore } from '../../stores/database';
import { navigateToNote } from '../../lib/navigate';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useUiStore, type DatabaseViewMode } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { useTagsStore } from '../../stores/tags';
import { toast } from '../../stores/toast';
import { SegmentedControl } from '../ui/SegmentedControl';
import { TypeFilterDropdown } from './TypeFilterDropdown';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { ColumnPicker } from './ColumnPicker';
import { FilterBar } from './FilterBar';
import { GalleryView } from './GalleryView';
import { Table, type DatabaseCellCommit } from './Table';

/**
 * Default count of property columns rendered when the user hasn't picked
 * any explicitly. Five fits the typical 1024px viewport with the Title
 * column without forcing horizontal scroll on first paint.
 */
const DEFAULT_VISIBLE_COLUMN_COUNT = 5;
const DEFAULT_QUERY_LIMIT = 1000;

// Frozen empty fallbacks — see BoardView/CalendarView for the same
// reasoning (avoid per-render `[]` allocations driving downstream
// memo invalidations).
const EMPTY_ROWS: readonly DatabaseRow[] = Object.freeze([]);
const EMPTY_GROUPS: readonly DatabaseGroup[] = Object.freeze([]);

/** Locale-aware "last updated at" formatter (HH:MM:SS). */
const TIME_FORMATTER = new Intl.DateTimeFormat('it', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export type DatabaseViewProps = {
  /** Saved view to apply first, used by inline database blocks. */
  initialViewId?: string;
  /** Compact framed surface for rendering inside the editor body. */
  embedded?: boolean;
  /** Notifies the embedding node when the user switches to another saved view. */
  onActiveViewChange?: (viewId: string) => void;
};

function createViewId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `view-${Date.now().toString(36)}`;
}

function coerceCellValue(type: PropertyType | null, value: string | boolean): unknown {
  if (typeof value === 'boolean') return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  switch (type) {
    case 'number': {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case 'boolean':
      return trimmed.toLowerCase() === 'true' || trimmed === '1' || trimmed.toLowerCase() === 'si';
    case 'string-array':
      return trimmed
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    case 'date':
    case 'url':
    case 'text':
    default:
      return trimmed;
  }
}

/**
 * Top-level database view. Replaces the placeholder shipped in Wave 1.
 *
 * Wiring:
 *  - State lives in `useDatabaseStore` so the query survives view switches
 *    (Editor → Database → Editor) without losing user-tuned filters.
 *  - We register the vault-event subscription once per mount of the view;
 *    the store cleans up on unmount. Initial query runs eagerly so the
 *    table is populated by the time the user lands on this screen.
 *  - Row clicks open the note in the editor store and flip the main view.
 *    `openNote` is async, but we switch the view synchronously so the
 *    editor pane is already mounted by the time the note resolves.
 */
export function DatabaseView(props: DatabaseViewProps = {}): JSX.Element {
  const { initialViewId, embedded = false, onActiveViewChange } = props;
  const query = useDatabaseStore((s) => s.query);
  const result = useDatabaseStore((s) => s.result);
  const loading = useDatabaseStore((s) => s.loading);
  const error = useDatabaseStore((s) => s.error);
  const availableProperties = useDatabaseStore((s) => s.availableProperties);
  const lastUpdatedAt = useDatabaseStore((s) => s.lastUpdatedAt);
  const setFilters = useDatabaseStore((s) => s.setFilters);
  const setSort = useDatabaseStore((s) => s.setSort);
  const setGroupBy = useDatabaseStore((s) => s.setGroupBy);
  const setFolder = useDatabaseStore((s) => s.setFolder);
  const setLimit = useDatabaseStore((s) => s.setLimit);
  const runQuery = useDatabaseStore((s) => s.runQuery);
  const applyViewState = useDatabaseStore((s) => s.applyViewState);
  const subscribeToVaultEvents = useDatabaseStore((s) => s.subscribeToVaultEvents);

  const selectedType = useDatabaseStore((s) => s.selectedType);
  const setType = useDatabaseStore((s) => s.setType);
  const tagTypes = useTagsStore((s) => s.types);
  const tagSchemas = useTagsStore((s) => s.objectTypeSchemas);

  const currentVault = useVaultStore((s) => s.current);
  const databaseViewMode = useUiStore((s) => s.databaseViewMode);
  const setDatabaseViewMode = useUiStore((s) => s.setDatabaseViewMode);

  // User-controlled column visibility. We seed it lazily once we have the
  // first non-empty available-properties list; subsequent vault events that
  // re-derive `availableProperties` don't reset the user's choice.
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [viewsFile, setViewsFile] = useState<DatabaseViewsFile | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const seededRef = useRef(false);

  const activeView = useMemo<DatabaseViewDefinition | null>(() => {
    if (viewsFile === null || activeViewId === null) return null;
    return viewsFile.views.find((view) => view.id === activeViewId) ?? null;
  }, [activeViewId, viewsFile]);

  const applyDatabaseView = useCallback(
    (view: DatabaseViewDefinition): void => {
      setActiveViewId(view.id);
      onActiveViewChange?.(view.id);
      setDatabaseViewMode(view.layout);
      if (view.columns.length > 0) {
        seededRef.current = true;
        setVisibleColumns(view.columns);
      } else {
        seededRef.current = false;
        setVisibleColumns([]);
      }
      void applyViewState({ query: view.query, selectedType: view.selectedType });
    },
    [applyViewState, onActiveViewChange, setDatabaseViewMode],
  );

  useEffect(() => {
    let cancelled = false;

    const loadViews = async (): Promise<void> => {
      try {
        const file = await ipc.listDatabaseViews();
        if (cancelled) return;
        setViewsFile(file);
        const nextActiveId = initialViewId ?? file.activeViewId ?? file.views[0]?.id ?? null;
        setActiveViewId(nextActiveId);
        const nextActive = file.views.find((view) => view.id === nextActiveId) ?? file.views[0];
        if (nextActive !== undefined) applyDatabaseView(nextActive);
      } catch {
        if (!cancelled) setViewsFile(null);
      }
    };

    void loadViews();
    const off = ipc.onDatabaseViewsChanged((file) => {
      setViewsFile(file);
      const nextActiveId = initialViewId ?? file.activeViewId ?? file.views[0]?.id ?? null;
      setActiveViewId(nextActiveId);
      const nextActive = file.views.find((view) => view.id === nextActiveId) ?? file.views[0];
      if (nextActive !== undefined) applyDatabaseView(nextActive);
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [applyDatabaseView, initialViewId]);

  useEffect(() => {
    if (seededRef.current) return;
    if (availableProperties.length === 0) return;
    seededRef.current = true;
    setVisibleColumns(availableProperties.slice(0, DEFAULT_VISIBLE_COLUMN_COUNT));
  }, [availableProperties]);

  // Drop seeded columns that no longer exist (e.g. user removed the
  // frontmatter key from every note). We don't auto-add new keys — the
  // user would lose their curation on every save.
  useEffect(() => {
    if (!seededRef.current) return;
    if (availableProperties.length === 0) return;
    const known = new Set(availableProperties);
    const filtered = visibleColumns.filter((k) => known.has(k));
    if (filtered.length !== visibleColumns.length) {
      setVisibleColumns(filtered);
    }
  }, [availableProperties, visibleColumns]);

  // Subscribe to vault events on mount, run the initial query.
  useEffect(() => {
    const off = subscribeToVaultEvents();
    void runQuery();
    return off;
  }, [runQuery, subscribeToVaultEvents]);

  // Folder-scope input is local-controlled with a small commit-on-blur
  // pattern so typing into it doesn't fire a query per keystroke. The
  // store's debouncer would coalesce them, but we'd still issue the IPC
  // round-trip on the trailing edge — committing on blur / Enter is more
  // explicit and avoids spamming the SQLite adapter while typing a path.
  const [folderDraft, setFolderDraft] = useState<string>(query.folder ?? '');
  useEffect(() => {
    setFolderDraft(query.folder ?? '');
  }, [query.folder]);

  const sort = query.sort;
  const sortKey = sort?.[0]?.key ?? 'title';
  const sortDirection = sort?.[0]?.direction ?? 'asc';

  const filters = useMemo(() => query.filters ?? [], [query.filters]);

  const persistActiveView = useCallback(
    (patch: Partial<DatabaseViewDefinition>): void => {
      if (activeView === null) return;
      const nextView: DatabaseViewDefinition = {
        ...activeView,
        query,
        selectedType,
        layout: databaseViewMode,
        columns: visibleColumns,
        ...patch,
        updatedAt: Date.now(),
      };
      setViewsFile((current) =>
        current === null
          ? current
          : {
              ...current,
              activeViewId: nextView.id,
              views: current.views.map((view) => (view.id === nextView.id ? nextView : view)),
            },
      );
      void ipc.upsertDatabaseView({ view: nextView });
    },
    [activeView, databaseViewMode, query, selectedType, visibleColumns],
  );

  const handleSelectView = (view: DatabaseViewDefinition): void => {
    applyDatabaseView(view);
  };

  const handleCreateView = (): void => {
    const timestamp = Date.now();
    const view: DatabaseViewDefinition = {
      id: createViewId(),
      name: `Vista ${(viewsFile?.views.length ?? 0) + 1}`,
      layout: databaseViewMode,
      query,
      selectedType,
      columns: visibleColumns,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setViewMenuOpen(false);
    setViewsFile((current) =>
      current === null
        ? { version: 1, activeViewId: view.id, views: [view] }
        : { ...current, activeViewId: view.id, views: [...current.views, view] },
    );
    applyDatabaseView(view);
    void ipc.upsertDatabaseView({ view });
  };

  const handleDuplicateView = (): void => {
    if (activeView === null) return;
    setViewMenuOpen(false);
    void ipc.duplicateDatabaseView({ id: activeView.id }).then((copy) => {
      setViewsFile((current) =>
        current === null
          ? { version: 1, activeViewId: copy.id, views: [copy] }
          : { ...current, activeViewId: copy.id, views: [...current.views, copy] },
      );
      applyDatabaseView(copy);
    });
  };

  const handleDeleteView = (): void => {
    if (activeView === null) return;
    setViewMenuOpen(false);
    void ipc.deleteDatabaseView({ id: activeView.id }).then((file) => {
      setViewsFile(file);
      const next = file.views.find((view) => view.id === file.activeViewId) ?? file.views[0];
      if (next !== undefined) applyDatabaseView(next);
    });
  };

  const handleVisibleColumnsChange = (columns: string[]): void => {
    setVisibleColumns(columns);
    persistActiveView({ columns });
  };

  const handleFiltersChange = (nextFilters: DatabaseQuery['filters']): void => {
    const nextQuery = { ...query, filters: nextFilters ?? [] };
    setFilters(nextQuery.filters ?? []);
    persistActiveView({ query: nextQuery });
  };

  const handleAddFilter = (filter: (typeof filters)[number]): void => {
    handleFiltersChange([...filters, filter]);
  };

  const handleUpdateFilter = (index: number, filter: (typeof filters)[number]): void => {
    const next = filters.slice();
    next[index] = filter;
    handleFiltersChange(next);
  };

  const handleRemoveFilter = (index: number): void => {
    handleFiltersChange(filters.slice(0, index).concat(filters.slice(index + 1)));
  };

  const handleSortChange = (sortValue: DatabaseQuery['sort']): void => {
    setSort(sortValue);
    const nextQuery = { ...query };
    if (sortValue === undefined || sortValue.length === 0) delete nextQuery.sort;
    else nextQuery.sort = sortValue;
    persistActiveView({ query: nextQuery });
  };

  const handleGroupByChange = (groupBy: string | null): void => {
    setGroupBy(groupBy);
    const nextQuery = { ...query };
    if (groupBy === null) delete nextQuery.groupBy;
    else nextQuery.groupBy = groupBy;
    persistActiveView({ query: nextQuery });
  };

  const handleFolderCommit = (value: string): void => {
    const trimmed = value.trim();
    const folder = trimmed === '' ? undefined : trimmed;
    setFolder(folder);
    const nextQuery = { ...query };
    if (folder === undefined) delete nextQuery.folder;
    else nextQuery.folder = folder;
    persistActiveView({ query: nextQuery });
  };

  const handleLimitChange = (limit: number): void => {
    setLimit(limit);
    persistActiveView({ query: { ...query, limit } });
  };

  const handleTypeChange = (type: string | null): void => {
    setType(type);
    persistActiveView({ selectedType: type });
  };

  const handleDatabaseViewModeChange = (mode: DatabaseViewMode): void => {
    setDatabaseViewMode(mode);
    persistActiveView({ layout: mode });
  };

  const suggestedColumnKeys = useMemo<string[]>(() => {
    if (selectedType === null) return [];
    const schema = tagSchemas.find((s) => s.id === selectedType);
    if (schema === undefined) return [];
    const propKeys = Object.keys(schema.schema.properties);
    const relKeys = Object.keys(schema.schema.relations);
    // Properties first, then relations. Dedup within the local
    // accumulator only; overlap with availableProperties is handled
    // in ColumnPicker.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of [...propKeys, ...relKeys]) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }, [selectedType, tagSchemas]);

  const rows = result?.rows ?? EMPTY_ROWS;
  const groups = result?.groups ?? EMPTY_GROUPS;
  const totalCount = result?.totalCount ?? 0;
  const queryLimit = query.limit ?? DEFAULT_QUERY_LIMIT;
  const noteCountLabel = totalCount === 1 ? '1 nota' : `${totalCount} note`;
  const visibleWindowLabel =
    rows.length > 0 && rows.length < totalCount ? `mostrate ${rows.length}` : null;

  const lastUpdatedLabel =
    lastUpdatedAt === null ? null : TIME_FORMATTER.format(new Date(lastUpdatedAt));

  // Clear-all-filters helper used by the empty state CTA.
  const clearAllFilters = (): void => {
    setFilters([]);
    setFolder(undefined);
    setType(null);
    const nextQuery = { ...query, filters: [] };
    delete nextQuery.folder;
    persistActiveView({ query: nextQuery, selectedType: null });
  };

  const onRowClick = (path: NotePath): void => {
    // Shared switch-view + open helper. View flips synchronously so the
    // editor surface appears immediately; the note body loads in the
    // background. Same flow used by the global graph node click.
    void navigateToNote(path);
  };

  const handleCellCommit = useCallback(
    async ({ path, key, type, value }: DatabaseCellCommit): Promise<void> => {
      try {
        const note = await ipc.loadNote({ path: path as NotePath });
        const nextFrontmatter: Frontmatter = { ...note.frontmatter };
        const nextValue = coerceCellValue(type, value);
        if (nextValue === undefined) delete nextFrontmatter[key];
        else nextFrontmatter[key] = nextValue;

        await ipc.saveNote({
          path: path as NotePath,
          body: note.content,
          frontmatter: nextFrontmatter,
        });
        await runQuery();
        await useVaultStore
          .getState()
          .refreshNotes()
          .catch(() => undefined);
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile aggiornare la cella');
      }
    },
    [runQuery],
  );

  // The body switches between three states (in priority order):
  //   1. error banner — show even if `result` is non-null, so the user
  //      sees the latest error overlaying the last good table.
  //   2. empty result — distinguish "vault is empty" vs "filters are too
  //      narrow" so the empty-state copy is actionable.
  //   3. populated table.
  const hasFilterOrFolder =
    filters.length > 0 || (query.folder ?? '') !== '' || selectedType !== null;
  const isEmpty = result !== null && result.rows.length === 0;
  const emptyDueToFilters = isEmpty && hasFilterOrFolder;
  const emptyDueToVault = isEmpty && !hasFilterOrFolder;

  // No vault open — Layout.tsx normally won't mount us in that case
  // (App.tsx renders <EmptyState />), but we guard defensively.
  if (currentVault === null) {
    return (
      <div
        className={
          embedded
            ? 'flex min-h-64 w-full items-center justify-center rounded-md border border-border bg-bg p-8 text-fg-muted'
            : 'flex h-full w-full items-center justify-center bg-bg p-8 text-fg-muted'
        }
      >
        <span className="text-sm">Apri un vault per usare la vista database.</span>
      </div>
    );
  }

  return (
    <section
      className={
        embedded
          ? 'flex h-[420px] w-full flex-col overflow-hidden rounded-md border border-border bg-bg text-sm'
          : 'flex h-full w-full flex-col bg-bg'
      }
    >
      <header
        className={
          embedded
            ? 'shrink-0 border-b border-border bg-bg-subtle px-3 py-2'
            : 'shrink-0 border-b border-border bg-bg-subtle px-4 py-2'
        }
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h1
              className={
                embedded ? 'text-sm font-semibold text-fg' : 'text-base font-semibold text-fg'
              }
            >
              {embedded && activeView !== null ? activeView.name : 'Database'}
            </h1>
            <span className="text-xs text-fg-muted">{noteCountLabel}</span>
            {visibleWindowLabel !== null && (
              <span className="text-xs text-fg-muted">{visibleWindowLabel}</span>
            )}
            {loading && (
              <span aria-live="polite" className="text-xs text-fg-muted">
                Aggiorno…
              </span>
            )}
            {!loading && lastUpdatedLabel !== null && (
              <span className="text-xs text-fg-muted" title="Ultimo aggiornamento">
                aggiornato {lastUpdatedLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TypeFilterDropdown
              types={tagTypes}
              selectedType={selectedType}
              onChange={handleTypeChange}
            />
            <ColumnPicker
              availableProperties={availableProperties}
              suggestedKeys={suggestedColumnKeys}
              visibleColumns={visibleColumns}
              onChange={handleVisibleColumnsChange}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Viste database salvate"
            className="flex min-w-0 flex-wrap items-center gap-1"
          >
            {(viewsFile?.views ?? []).map((view) => {
              const active = view.id === activeViewId;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={(): void => handleSelectView(view)}
                  className={
                    active
                      ? 'rounded bg-bg-muted px-2 py-1 text-xs font-medium text-fg'
                      : 'rounded px-2 py-1 text-xs font-medium text-fg-subtle hover:bg-bg-muted hover:text-fg'
                  }
                >
                  {view.name}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              onClick={(): void => setViewMenuOpen((open) => !open)}
              className="rounded border border-border bg-bg-subtle px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              Vista
            </button>
            {viewMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-40 rounded border border-border bg-bg p-1 text-xs shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleCreateView}
                  className="block w-full rounded px-2 py-1 text-left text-fg-subtle hover:bg-bg-muted hover:text-fg"
                >
                  Nuova vista
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDuplicateView}
                  className="block w-full rounded px-2 py-1 text-left text-fg-subtle hover:bg-bg-muted hover:text-fg"
                >
                  Duplica
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDeleteView}
                  className="block w-full rounded px-2 py-1 text-left text-red-600 hover:bg-red-500/10"
                >
                  Elimina
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FilterBar
            filters={filters}
            availableProperties={availableProperties}
            rows={rows}
            onAdd={handleAddFilter}
            onUpdate={handleUpdateFilter}
            onRemove={handleRemoveFilter}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <SortControls
            sortKey={sortKey}
            sortDirection={sortDirection}
            availableProperties={availableProperties}
            onChange={handleSortChange}
          />

          <GroupByControl
            groupBy={query.groupBy ?? null}
            availableProperties={availableProperties}
            onChange={handleGroupByChange}
          />

          <FolderScopeInput
            value={folderDraft}
            onChange={setFolderDraft}
            onCommit={handleFolderCommit}
          />

          <LimitControl value={queryLimit} onChange={handleLimitChange} />

          <ViewModeTabs current={databaseViewMode} onChange={handleDatabaseViewModeChange} />
        </div>
      </header>

      {error !== null && (
        <div
          role="alert"
          className="shrink-0 border-b border-border bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {emptyDueToVault && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-fg-muted">
            <p className="text-sm">
              Nessuna nota da mostrare. Crea note nel vault per popolare la tabella.
            </p>
          </div>
        )}

        {emptyDueToFilters && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-fg-muted">
            <p className="text-sm">Nessuna nota corrisponde ai filtri.</p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded border border-border bg-bg-subtle px-3 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              Mostra tutte le note
            </button>
          </div>
        )}

        {!isEmpty && result !== null && databaseViewMode === 'table' && (
          <Table
            rows={rows}
            groups={groups}
            totalCount={totalCount}
            columns={visibleColumns}
            sort={query.sort}
            groupBy={query.groupBy}
            onSortChange={setSort}
            onRowClick={onRowClick}
            onCellCommit={(args): void => {
              void handleCellCommit(args);
            }}
          />
        )}

        {!isEmpty && result !== null && databaseViewMode === 'board' && <BoardView />}

        {!isEmpty && result !== null && databaseViewMode === 'calendar' && <CalendarView />}

        {!isEmpty && result !== null && databaseViewMode === 'gallery' && (
          <GalleryView rows={rows} columns={visibleColumns} onRowClick={onRowClick} />
        )}

        {result === null && error === null && (
          <div className="flex h-full items-center justify-center p-8 text-fg-muted">
            <span className="text-sm">Carico…</span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Sort key + asc/desc toggle. Empty state implies sort-by-title. */
function SortControls({
  sortKey,
  sortDirection,
  availableProperties,
  onChange,
}: {
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  availableProperties: string[];
  onChange(sort: DatabaseQuery['sort']): void;
}): JSX.Element {
  // Always include `title` as a possible sort key — it's the implicit
  // fallback the adapter applies when no sort is given.
  const options = ['title', ...availableProperties];
  return (
    <div className="flex items-center gap-1">
      <label className="text-fg-muted">Ordina:</label>
      <select
        value={sortKey}
        onChange={(e): void => {
          onChange([{ key: e.target.value, direction: sortDirection }]);
        }}
        aria-label="Ordina per"
        className="rounded border border-border bg-bg-subtle px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        {options.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={(): void => {
          onChange([{ key: sortKey, direction: sortDirection === 'asc' ? 'desc' : 'asc' }]);
        }}
        title={sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
        aria-label={sortDirection === 'asc' ? 'Crescente' : 'Decrescente'}
        className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg"
      >
        {sortDirection === 'asc' ? '▲' : '▼'}
      </button>
    </div>
  );
}

/** Group-by dropdown. `''` = no grouping. */
function GroupByControl({
  groupBy,
  availableProperties,
  onChange,
}: {
  groupBy: string | null;
  availableProperties: string[];
  onChange(key: string | null): void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <label className="text-fg-muted">Raggruppa:</label>
      <select
        value={groupBy ?? ''}
        onChange={(e): void => {
          const v = e.target.value;
          onChange(v === '' ? null : v);
        }}
        aria-label="Raggruppa per"
        className="rounded border border-border bg-bg-subtle px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="">(nessuno)</option>
        {availableProperties.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Optional folder-scope input. Commits on Enter / blur to avoid querying
 * on every keystroke (the user is typing a path, not a search term).
 */
function FolderScopeInput({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange(v: string): void;
  onCommit(v: string): void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <label className="text-fg-muted">Cartella:</label>
      <input
        type="text"
        value={value}
        onChange={(e): void => onChange(e.target.value)}
        onBlur={(): void => onCommit(value)}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        placeholder="(tutte)"
        className="w-40 rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent placeholder:text-fg-muted"
      />
    </div>
  );
}

function LimitControl({
  value,
  onChange,
}: {
  value: number;
  onChange(limit: number): void;
}): JSX.Element {
  const options = [50, 100, 250, 1000, 5000];
  const normalized = options.includes(value) ? value : DEFAULT_QUERY_LIMIT;

  return (
    <div className="flex items-center gap-1">
      <label className="text-fg-muted">Righe:</label>
      <select
        value={normalized}
        onChange={(e): void => onChange(Number(e.target.value))}
        aria-label="Righe per vista"
        className="rounded border border-border bg-bg-subtle px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Database view-mode switcher: Table / Board / Calendar. Persisted via
 * `useUiStore.databaseViewMode`. The query state itself is shared
 * across modes — switching tabs doesn't lose filters or sort.
 */
function ViewModeTabs({
  current,
  onChange,
}: {
  current: DatabaseViewMode;
  onChange(mode: DatabaseViewMode): void;
}): JSX.Element {
  const TABS: ReadonlyArray<{ id: DatabaseViewMode; label: string }> = [
    { id: 'table', label: 'Tabella' },
    { id: 'board', label: 'Board' },
    { id: 'calendar', label: 'Calendario' },
    { id: 'gallery', label: 'Galleria' },
  ];
  return (
    <SegmentedControl
      ariaLabel="Vista database"
      value={current}
      items={TABS}
      onChange={onChange}
      className="ml-auto"
    />
  );
}
