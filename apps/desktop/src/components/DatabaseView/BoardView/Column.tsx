import clsx from 'clsx';
import { useState, type DragEvent, type JSX } from 'react';
import type { DatabaseRow } from '../../../../shared/ipc';
import { Card } from './Card';
import { type BoardColumn, NULL_COLUMN_ID } from './helpers';

type Props = {
  column: BoardColumn;
  /** The active groupBy property key (passed through to cards). */
  groupBy: string;
  /** Picked-once secondary key shown on every card. */
  secondaryKey: string | null;
  /** The card currently being dragged, if any (board-level state). */
  draggingPath: string | null;
  /** Path of the card whose save is in flight, if any. */
  savingPath: string | null;
  onCardDragStart(row: DatabaseRow, columnId: string): void;
  onCardDragEnd(): void;
  onCardOpen(path: string): void;
  /** Called once per drop; the parent owns the patch + IPC orchestration. */
  onDrop(toColumn: BoardColumn): void;
};

/**
 * One kanban column with a fixed-width body and a drop zone that
 * accepts cards. Drop highlight is local state — bubbling to the
 * board would force a re-render of every column on every drag-over.
 *
 * The column itself is NOT scrollable horizontally; the board container
 * provides the horizontal flex track and the column owns its vertical
 * scroll for tall card stacks.
 */
export function Column({
  column,
  groupBy,
  secondaryKey,
  draggingPath,
  savingPath,
  onCardDragStart,
  onCardDragEnd,
  onCardOpen,
  onDrop,
}: Props): JSX.Element {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    // Both `dragenter` and `dragover` need preventDefault for the drop
    // event to fire. Setting `dropEffect = 'move'` shows the right
    // cursor in modern browsers.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    // Only clear the highlight when the drag actually leaves THIS
    // column. Without the relatedTarget check, dragging over a child
    // card flashes the border off and on.
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setIsOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsOver(false);
    onDrop(column);
  };

  const isNull = column.id === NULL_COLUMN_ID;

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={`Colonna ${column.label}`}
      className={clsx(
        'flex h-full w-64 shrink-0 flex-col rounded-md border bg-bg-subtle',
        isOver ? 'border-accent ring-2 ring-accent/40' : 'border-border',
      )}
    >
      <header className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3
          className={clsx(
            'truncate text-xs font-semibold uppercase tracking-wide',
            isNull ? 'text-fg-muted' : 'text-fg-subtle',
          )}
          title={column.label}
        >
          {column.label}
        </h3>
        <span className="shrink-0 rounded-full bg-bg-muted px-1.5 py-0.5 text-[10px] text-fg-muted">
          {column.rows.length}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {column.rows.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-fg-muted">
            Trascina qui le note
          </div>
        )}
        {column.rows.map((row) => (
          <Card
            key={row.path}
            row={row}
            columnId={column.id}
            groupBy={groupBy}
            secondaryKey={secondaryKey}
            dragging={draggingPath === row.path}
            saving={savingPath === row.path}
            onOpen={onCardOpen}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
