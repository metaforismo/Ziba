import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { NotePath } from '@synapsium/core';
import type { DatabaseQuery } from '../../../shared/ipc';
import { useDatabaseStore } from '../../stores/database';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { ColumnPicker } from './ColumnPicker';
import { FilterBar } from './FilterBar';
import { Table } from './Table';

/**
 * Default count of property columns rendered when the user hasn't picked
 * any explicitly. Five fits the typical 1024px viewport with the Title
 * column without forcing horizontal scroll on first paint.
 */
const DEFAULT_VISIBLE_COLUMN_COUNT = 5;

/** Locale-aware "last updated at" formatter (HH:MM:SS). */
const TIME_FORMATTER = new Intl.DateTimeFormat('it', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

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
export function DatabaseView(): JSX.Element {
  const query = useDatabaseStore((s) => s.query);
  const result = useDatabaseStore((s) => s.result);
  const loading = useDatabaseStore((s) => s.loading);
  const error = useDatabaseStore((s) => s.error);
  const availableProperties = useDatabaseStore((s) => s.availableProperties);
  const lastUpdatedAt = useDatabaseStore((s) => s.lastUpdatedAt);
  const setFilters = useDatabaseStore((s) => s.setFilters);
  const addFilter = useDatabaseStore((s) => s.addFilter);
  const removeFilter = useDatabaseStore((s) => s.removeFilter);
  const updateFilter = useDatabaseStore((s) => s.updateFilter);
  const setSort = useDatabaseStore((s) => s.setSort);
  const setGroupBy = useDatabaseStore((s) => s.setGroupBy);
  const setFolder = useDatabaseStore((s) => s.setFolder);
  const runQuery = useDatabaseStore((s) => s.runQuery);
  const subscribeToVaultEvents = useDatabaseStore((s) => s.subscribeToVaultEvents);

  const currentVault = useVaultStore((s) => s.current);
  const setMainView = useUiStore((s) => s.setMainView);
  const openNote = useEditorStore((s) => s.openNote);

  // User-controlled column visibility. We seed it lazily once we have the
  // first non-empty available-properties list; subsequent vault events that
  // re-derive `availableProperties` don't reset the user's choice.
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const seededRef = useRef(false);

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

  const rows = result?.rows ?? [];
  const groups = result?.groups ?? [];
  const totalCount = result?.totalCount ?? 0;
  const noteCountLabel = totalCount === 1 ? '1 nota' : `${totalCount} note`;

  const lastUpdatedLabel =
    lastUpdatedAt === null ? null : TIME_FORMATTER.format(new Date(lastUpdatedAt));

  // Clear-all-filters helper used by the empty state CTA.
  const clearAllFilters = (): void => {
    setFilters([]);
    setFolder(undefined);
  };

  const onRowClick = (path: NotePath): void => {
    // Switch view first so the editor surface is on screen; the note will
    // load asynchronously. Loading the note before flipping would leave
    // the user staring at the table for a few hundred ms.
    setMainView('editor');
    void openNote(path);
  };

  // The body switches between three states (in priority order):
  //   1. error banner — show even if `result` is non-null, so the user
  //      sees the latest error overlaying the last good table.
  //   2. empty result — distinguish "vault is empty" vs "filters are too
  //      narrow" so the empty-state copy is actionable.
  //   3. populated table.
  const hasFilterOrFolder = filters.length > 0 || (query.folder ?? '') !== '';
  const isEmpty = result !== null && result.rows.length === 0;
  const emptyDueToFilters = isEmpty && hasFilterOrFolder;
  const emptyDueToVault = isEmpty && !hasFilterOrFolder;

  // No vault open — Layout.tsx normally won't mount us in that case
  // (App.tsx renders <EmptyState />), but we guard defensively.
  if (currentVault === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg p-8 text-fg-muted">
        <span className="text-sm">Apri un vault per usare la vista database.</span>
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col bg-bg">
      <header className="shrink-0 border-b border-border bg-bg-subtle px-4 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-semibold text-fg">Database</h1>
            <span className="text-xs text-fg-muted">{noteCountLabel}</span>
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
          <ColumnPicker
            availableProperties={availableProperties}
            visibleColumns={visibleColumns}
            onChange={setVisibleColumns}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FilterBar
            filters={filters}
            availableProperties={availableProperties}
            rows={rows}
            onAdd={addFilter}
            onUpdate={updateFilter}
            onRemove={removeFilter}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <SortControls
            sortKey={sortKey}
            sortDirection={sortDirection}
            availableProperties={availableProperties}
            onChange={setSort}
          />

          <GroupByControl
            groupBy={query.groupBy ?? null}
            availableProperties={availableProperties}
            onChange={setGroupBy}
          />

          <FolderScopeInput
            value={folderDraft}
            onChange={setFolderDraft}
            onCommit={(v): void => {
              const trimmed = v.trim();
              setFolder(trimmed === '' ? undefined : trimmed);
            }}
          />
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

        {!isEmpty && result !== null && (
          <Table
            rows={rows}
            groups={groups}
            totalCount={totalCount}
            columns={visibleColumns}
            sort={query.sort}
            groupBy={query.groupBy}
            onSortChange={setSort}
            onRowClick={onRowClick}
          />
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
