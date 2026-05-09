// Kanban board view for the database. Replaces the v0.4 Wave 1 placeholder.
//
// Architecture:
//   - Reads the active query result + `groupBy` from `useDatabaseStore`.
//     We don't auto-pick a groupBy — the user must explicitly set one
//     via the header dropdown so the "what am I looking at?" question is
//     always answered by the form, not by a hidden heuristic.
//   - Columns + per-column row distribution are computed via the pure
//     helpers in `./helpers.ts`. Memoized on `[rows, groups, groupBy]`
//     so unrelated state updates (loading, sort, filters) don't
//     recompute the layout.
//   - Drag-and-drop uses the native HTML5 API: `draggable={true}` on
//     cards, `onDragOver` / `onDrop` on columns. No external dep.
//   - On drop we (1) load the note's full frontmatter, (2) apply the
//     patch from `buildFrontmatterAfterMove`, (3) persist via
//     `ipc.saveNote`. The vault watcher then re-queries the store
//     within ~250ms, so we don't need to manually mutate `result`.
//   - Optimistic UI: the dragged card stays at its original position
//     until the save resolves; we surface "Salvataggio…" on the card.
//     A failure shows an inline banner above the board.

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import type { Frontmatter } from '@synapsium/core';
import type { DatabaseRow } from '../../../../shared/ipc';
import { ipc } from '../../../lib/ipc';
import { navigateToNote } from '../../../lib/navigate';
import { useDatabaseStore } from '../../../stores/database';
import { Column } from './Column';
import {
  type BoardColumn,
  applyFrontmatterPatch,
  buildColumns,
  buildFrontmatterAfterMove,
  pickSecondaryPropertyKey,
} from './helpers';

/**
 * Empty-state shown when the user hasn't picked a `groupBy`. Deliberately
 * a no-op surface — auto-picking a property would surprise the user
 * (different databases would group themselves differently on first load).
 */
function NoGroupByState(): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg p-8 text-center text-fg-muted">
      <p className="max-w-sm text-sm">
        Imposta &quot;Raggruppa per&quot; nel header per visualizzare la board.
      </p>
    </div>
  );
}

export function BoardView(): JSX.Element {
  const result = useDatabaseStore((s) => s.result);
  const groupBy = useDatabaseStore((s) => s.query.groupBy);

  // Drag state: which card is being dragged + which is currently saving.
  // Both are kept here (rather than per-card) so the drop handler can
  // read them synchronously without props drilling.
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [draggingFromColumn, setDraggingFromColumn] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state when groupBy / result identity changes — the
  // current drag refers to a column id that may not exist anymore after
  // a re-query.
  useEffect(() => {
    setDraggingPath(null);
    setDraggingFromColumn(null);
  }, [groupBy, result]);

  // `rows` / `groups` are wrapped in `useMemo` (rather than read inline)
  // so the `??[]` fallback identity stays stable across renders that
  // don't actually change the result — otherwise the downstream
  // `useMemo(buildColumns)` would re-run on every render.
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const groups = useMemo(() => result?.groups ?? [], [result]);

  // Memoize the heavy pieces. `buildColumns` is O(rows + groups) and we
  // hit it on every render (Zustand selectors return fresh refs on
  // unrelated mutations); the deps gate covers it.
  const columns = useMemo<BoardColumn[]>(() => {
    if (groupBy === undefined || groupBy === '') return [];
    return buildColumns(rows, groups, groupBy);
  }, [rows, groups, groupBy]);

  const secondaryKey = useMemo<string | null>(() => {
    if (groupBy === undefined || groupBy === '') return null;
    return pickSecondaryPropertyKey(rows, groupBy);
  }, [rows, groupBy]);

  const onCardOpen = useCallback((path: string): void => {
    void navigateToNote(path);
  }, []);

  const onCardDragStart = useCallback((row: DatabaseRow, columnId: string): void => {
    setDraggingPath(row.path);
    setDraggingFromColumn(columnId);
    setError(null);
  }, []);

  const onCardDragEnd = useCallback((): void => {
    setDraggingPath(null);
    setDraggingFromColumn(null);
  }, []);

  const onDrop = useCallback(
    (toColumn: BoardColumn): void => {
      // Read the row + source column from React state. We snapshot here
      // because the closure may run after `dragend` clears the state.
      const path = draggingPath;
      const fromColumnId = draggingFromColumn;
      setDraggingPath(null);
      setDraggingFromColumn(null);
      if (path === null || fromColumnId === null) return;
      if (groupBy === undefined || groupBy === '') return;
      const row = rows.find((r) => r.path === path);
      if (row === undefined) return;

      const patch = buildFrontmatterAfterMove({
        row,
        groupBy,
        fromColumnId,
        toColumn,
      });
      // `null` = deliberate no-op (same column, or dup multi-select target).
      if (patch === null) return;

      // Run the load → patch → save in the background. The watcher will
      // push a vault event back to us when the file changes on disk;
      // `useDatabaseStore` re-queries from there. We just track the
      // saving indicator + any error message.
      setSavingPath(path);
      setError(null);
      void persistMove(path, patch)
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : 'Errore sconosciuto';
          setError(`Impossibile salvare lo spostamento: ${message}`);
        })
        .finally(() => {
          setSavingPath((cur) => (cur === path ? null : cur));
        });
    },
    [draggingPath, draggingFromColumn, groupBy, rows],
  );

  // ---- Render branches ----------------------------------------------------

  if (groupBy === undefined || groupBy === '') {
    return <NoGroupByState />;
  }

  // Even with no rows, render the columns: the user may want to drop
  // notes into the (senza valore) bucket once they create some.
  return (
    <div className="flex h-full w-full flex-col">
      {error !== null && (
        <div
          role="alert"
          className="shrink-0 border-b border-border bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-bg p-3"
        // Native horizontal-scroll surface. Columns are flex children
        // with shrink-0 so they keep their 256px width regardless of
        // the container.
      >
        <div className="flex h-full min-w-min items-stretch gap-3">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              groupBy={groupBy}
              secondaryKey={secondaryKey}
              draggingPath={draggingPath}
              savingPath={savingPath}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onCardOpen={onCardOpen}
              onDrop={onDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Side-effect: load the note's frontmatter, merge the patch, persist.
 * Pulled out so the hook closure stays small and easy to read.
 *
 * We deliberately re-load (instead of using `row.properties`) because
 * `DatabaseRow` only carries the indexed projection of the frontmatter;
 * keys the detector dropped (deep objects, mixed-type arrays, etc.)
 * would be lost on a naive write-back.
 */
async function persistMove(path: string, patch: Frontmatter): Promise<void> {
  const note = await ipc.loadNote({ path });
  const frontmatter = applyFrontmatterPatch(note.frontmatter, patch);
  await ipc.saveNote({
    path,
    body: note.content,
    frontmatter,
  });
}
