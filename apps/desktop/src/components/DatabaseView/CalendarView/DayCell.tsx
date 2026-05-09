import clsx from 'clsx';
import type { JSX } from 'react';
import type { NotePath } from '@ziba/core';
import type { DatabaseRow } from '../../../../shared/ipc';
import type { DayCell as DayCellModel } from './helpers';

type Props = {
  cell: DayCellModel;
  onPillClick(path: NotePath): void;
};

/**
 * Hard cap on visible pills per day. Above this we render the first
 * `MAX_VISIBLE_PILLS` then a "+N altre" indicator. Three keeps the
 * cell readable at min-h-24 and matches the v0.4 spec.
 */
const MAX_VISIBLE_PILLS = 3;

/**
 * One day in the month grid. Shows the day number top-right, then up
 * to three note pills. Click on the cell itself does nothing; click
 * on a pill navigates to that note.
 *
 * The cell intentionally has no `onClick` — clicking empty space
 * inside a day is reserved for v0.5 (create-with-prefilled-date).
 */
export function DayCell({ cell, onPillClick }: Props): JSX.Element {
  const overflow = Math.max(0, cell.notes.length - MAX_VISIBLE_PILLS);
  const visibleNotes = cell.notes.slice(0, MAX_VISIBLE_PILLS);

  return (
    <div
      className={clsx(
        'flex min-h-24 flex-col gap-1 border border-border bg-bg p-1.5 text-xs',
        // Out-of-month cells still render — the user wants context
        // for the leading/trailing days — but dimmed so the focus
        // stays on the current month.
        !cell.isCurrentMonth && 'opacity-40',
        // Today gets an accent border so it pops even when the
        // current month is the active one.
        cell.isToday && 'border-2 border-accent',
      )}
    >
      <div className="flex items-start justify-end">
        <span
          className={clsx(
            'text-[11px] font-medium tabular-nums',
            cell.isToday ? 'text-accent' : 'text-fg-subtle',
          )}
        >
          {cell.date.getDate()}
        </span>
      </div>

      {visibleNotes.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {visibleNotes.map((note) => (
            <li key={note.path}>
              <NotePill note={note} onClick={onPillClick} />
            </li>
          ))}
          {overflow > 0 && (
            <li
              className="px-1.5 text-[10px] font-medium text-fg-muted"
              title={`${overflow} ${overflow === 1 ? 'altra nota' : 'altre note'} in questo giorno`}
            >
              +{overflow} {overflow === 1 ? 'altra' : 'altre'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function NotePill({
  note,
  onClick,
}: {
  note: DatabaseRow;
  onClick(path: NotePath): void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={(): void => onClick(note.path)}
      // Keep the title attribute so the user can still see the full
      // note title when truncated. `truncate` requires a block-level
      // box, hence the `block w-full`.
      title={note.title}
      className="block w-full truncate rounded bg-bg-muted px-1.5 py-0.5 text-left text-[11px] text-fg-subtle hover:bg-accent/10 hover:text-accent focus:bg-accent/10 focus:text-accent focus:outline-none"
    >
      {note.title}
    </button>
  );
}
