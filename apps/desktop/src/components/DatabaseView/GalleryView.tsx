import type { JSX } from 'react';
import type { NotePath } from '@ziba/core';
import type { DatabaseRow, PropertyType } from '../../../shared/ipc';
import { PropertyValueView, detectPropertyType, typeBadge } from './propertyShared';

type Props = {
  rows: readonly DatabaseRow[];
  /** Property keys to surface on each card, in display order (shared with Table). */
  columns: readonly string[];
  onRowClick(path: NotePath): void;
};

/**
 * Hard cap on properties rendered per card. Mirrors the calendar's pill
 * cap and the board card's restraint — a card is a glanceable summary, not
 * a full row. Above this we show a "+N" hint so the user knows the note
 * carries more metadata than fits.
 *
 * NOTE: there is no `image`/`cover` property type in the indexer's
 * detection set (`text | number | boolean | date | url | string-array`),
 * so every card is a clean text card. If an image type is added later,
 * detect it here and render a cover band above the title.
 */
const MAX_VISIBLE_PROPERTIES = 4;

/**
 * Gallery / card-grid layout for the database. Reads the same shared query
 * result (`rows`) and the same visible-column selection (`columns`) the
 * Table view uses — filter/sort are already applied upstream in the store,
 * so this component only renders. Zero-rows is handled by the parent's
 * shared `EmptyView`, so the grid here never renders an empty-state of its
 * own (avoids the double-render the task flags).
 */
export function GalleryView({ rows, columns, onRowClick }: Props): JSX.Element {
  // Pre-compute per-column type once so the card loop doesn't traverse
  // rows for every property of every card. Same pattern as Table.
  const columnTypes = new Map<string, PropertyType | null>();
  for (const key of columns) {
    columnTypes.set(key, detectPropertyType(rows, key));
  }

  return (
    <div className="h-full overflow-auto bg-bg p-3">
      <ul
        // auto-fill keeps cards a comfortable reading width and reflows
        // responsively from one column on narrow panes up to many on wide
        // displays without a media-query ladder.
        className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
      >
        {rows.map((row) => (
          <li key={row.path}>
            <GalleryCard
              row={row}
              columns={columns}
              columnTypes={columnTypes}
              onRowClick={onRowClick}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function GalleryCard({
  row,
  columns,
  columnTypes,
  onRowClick,
}: {
  row: DatabaseRow;
  columns: readonly string[];
  columnTypes: Map<string, PropertyType | null>;
  onRowClick(path: NotePath): void;
}): JSX.Element {
  // Only render properties the note actually carries, so a card never shows
  // a column of em-dashes. Cap the visible set and surface the remainder as
  // a "+N" hint.
  const presentColumns = columns.filter((key) => row.properties[key] !== undefined);
  const visibleColumns = presentColumns.slice(0, MAX_VISIBLE_PROPERTIES);
  const overflow = presentColumns.length - visibleColumns.length;

  return (
    <button
      type="button"
      onClick={(): void => onRowClick(row.path)}
      title={row.path}
      // Mirrors the board card's interaction language: bordered surface,
      // accent hover, focus-visible ring. reduced-motion guard on the
      // transition keeps the lift subtle for users who opt out.
      className="flex h-full w-full flex-col gap-2 rounded-md border border-border bg-bg-subtle p-3 text-left shadow-sm transition hover:border-accent/50 hover:bg-bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
    >
      {/* Title leads the card — clamped to two lines so a long note title
          doesn't blow out the card height in a tight grid. */}
      <span className="line-clamp-2 text-sm font-semibold leading-snug text-fg">{row.title}</span>

      {visibleColumns.length > 0 && (
        <dl className="flex flex-col gap-1">
          {visibleColumns.map((key) => {
            const type = columnTypes.get(key) ?? null;
            return (
              <div key={key} className="flex min-w-0 items-baseline gap-1.5 text-xs">
                <dt className="flex shrink-0 items-baseline gap-1 text-fg-muted">
                  <span aria-hidden="true" className="text-[10px]">
                    {typeBadge(type ?? 'text')}
                  </span>
                  <span className="truncate">{key}</span>
                </dt>
                <dd className="min-w-0 flex-1 truncate text-fg-subtle">
                  <PropertyValueView prop={row.properties[key]} />
                </dd>
              </div>
            );
          })}
          {overflow > 0 && (
            <div
              className="text-[10px] font-medium text-fg-muted"
              title={`${overflow} ${overflow === 1 ? 'altra proprietà' : 'altre proprietà'}`}
            >
              +{overflow} {overflow === 1 ? 'altra' : 'altre'}
            </div>
          )}
        </dl>
      )}
    </button>
  );
}
