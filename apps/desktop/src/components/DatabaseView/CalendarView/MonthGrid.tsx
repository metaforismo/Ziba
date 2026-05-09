import type { JSX } from 'react';
import type { NotePath } from '@ziba/core';
import { DayCell } from './DayCell';
import type { DayCell as DayCellModel } from './helpers';

type Props = {
  cells: DayCellModel[];
  onPillClick(path: NotePath): void;
};

/**
 * Italian week-day headers, Monday-first. Three-letter abbreviations
 * keep the columns narrow; the spec requires "Lun / Mar / …" so we
 * stick to the literal labels rather than `Intl.DateTimeFormat` which
 * would render "lun" with a lowercase first letter.
 */
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

/**
 * The 7-column month grid. Renders a sticky weekday-row header, then
 * 5 or 6 rows of DayCells. The `cells` prop is pre-built by
 * `buildMonthGrid` — this component is purely a layout primitive.
 */
export function MonthGrid({ cells, onPillClick }: Props): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-bg-subtle">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-7">
          {cells.map((cell) => (
            <DayCell
              // Use the local-date components for the React key so a
              // re-render with a different month-anchor doesn't reuse
              // a cell that "happened to land" on the same index.
              key={`${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`}
              cell={cell}
              onPillClick={onPillClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
