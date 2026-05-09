import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { NotePath } from '@synapsium/core';
import type { DatabaseRow, PropertyType } from '../../../../shared/ipc';
import { navigateToNote } from '../../../lib/navigate';
import { useDatabaseStore } from '../../../stores/database';
import { MonthGrid } from './MonthGrid';
import { buildMonthGrid, formatMonthTitle } from './helpers';

// Module-level frozen empty array. `useMemo(() => result?.rows ?? [])`
// looks stable but every fresh `[]` produced when `result` is null
// causes downstream `useMemo`s to recompute (their array dep churns
// on every render even though the value is "no data" both times).
// Sharing one frozen instance keeps reference equality across renders.
const EMPTY_ROWS: readonly DatabaseRow[] = Object.freeze([]);

/**
 * Detect whether a property key resolves to a `date`-typed property
 * across the rows. Uses the same first-non-empty heuristic as the
 * Table view's column-type detection — a stable type per key matches
 * how the indexer enforces detection at write time.
 */
function detectGroupByType(rows: readonly DatabaseRow[], key: string): PropertyType | null {
  for (const row of rows) {
    const prop = row.properties[key];
    if (prop !== undefined) return prop.type;
  }
  return null;
}

/**
 * Monthly calendar view of the database. Reads `query.groupBy` from
 * the database store: when it points at a date-typed property, the
 * matching rows are bucketed by day and rendered as pills inside the
 * month grid.
 *
 * Month navigation is local React state (default = today's month).
 * Persisting the cursor across DatabaseView mounts isn't worth the
 * store churn for v0.4 — most calendar use is "open the view, look
 * at this month, click a note".
 */
export function CalendarView(): JSX.Element {
  const result = useDatabaseStore((s) => s.result);
  const groupBy = useDatabaseStore((s) => s.query.groupBy);

  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  const rows = result?.rows ?? EMPTY_ROWS;

  // Detect the groupBy property's type. Empty / missing / non-date →
  // we render the empty-state and bail out of the rest of the work.
  const groupByType = groupBy === undefined ? null : detectGroupByType(rows, groupBy);
  const isValidDateGroupBy = groupBy !== undefined && groupByType === 'date';

  // Build the grid. We always compute against `groupBy ?? ''` and
  // then short-circuit; passing the empty string yields cells with
  // `notes: []` which is exactly what we'd want anyway.
  const cells = useMemo(() => {
    if (!isValidDateGroupBy || groupBy === undefined) return [];
    return buildMonthGrid(cursor.year, cursor.month, rows, groupBy);
  }, [cursor.year, cursor.month, rows, groupBy, isValidDateGroupBy]);

  const monthTitle = useMemo(
    () => formatMonthTitle(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const goToPrevMonth = (): void => {
    setCursor((c) => {
      // Wrap January → December of the previous year. The Date
      // constructor would handle this for us, but doing the math
      // explicitly keeps the state shape obvious.
      const month = c.month === 0 ? 11 : c.month - 1;
      const year = c.month === 0 ? c.year - 1 : c.year;
      return { year, month };
    });
  };

  const goToNextMonth = (): void => {
    setCursor((c) => {
      const month = c.month === 11 ? 0 : c.month + 1;
      const year = c.month === 11 ? c.year + 1 : c.year;
      return { year, month };
    });
  };

  const goToToday = (): void => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  };

  const onPillClick = (path: NotePath): void => {
    void navigateToNote(path);
  };

  // Compute "no rows have a value for groupBy" once — used for the
  // bottom hint when groupBy is valid but no row contributes a pill.
  // Counting visible notes is cheap (35-42 cells, max 1000 rows).
  const hasAnyMatch = useMemo(() => {
    if (!isValidDateGroupBy) return false;
    return cells.some((cell) => cell.notes.length > 0);
  }, [cells, isValidDateGroupBy]);

  if (!isValidDateGroupBy) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg p-8 text-fg-muted">
        <span className="max-w-md text-center text-sm">
          Imposta &lsquo;Raggruppa per&rsquo; su una proprietà di tipo data per visualizzare il
          calendario.
        </span>
      </div>
    );
  }

  return (
    <section className="flex h-full w-full flex-col bg-bg">
      <header className="shrink-0 border-b border-border bg-bg-subtle px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold capitalize text-fg" aria-live="polite">
            {monthTitle}
          </h2>
          <div className="ml-auto flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={goToPrevMonth}
              aria-label="Mese precedente"
              className="rounded border border-border bg-bg px-2 py-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="rounded border border-border bg-bg px-2 py-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              Oggi
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              aria-label="Mese successivo"
              className="rounded border border-border bg-bg px-2 py-0.5 text-fg-subtle hover:bg-bg-muted hover:text-fg"
            >
              ›
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <MonthGrid cells={cells} onPillClick={onPillClick} />
      </div>

      {!hasAnyMatch && (
        <div className="shrink-0 border-t border-border bg-bg-subtle px-3 py-1.5 text-xs text-fg-muted">
          Nessuna nota ha <code className="font-mono">{groupBy}</code>.
        </div>
      )}
    </section>
  );
}
