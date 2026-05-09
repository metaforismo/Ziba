import clsx from 'clsx';
import type { JSX } from 'react';
import type {
  DatabaseGroup,
  DatabaseQuery,
  DatabaseRow,
  DetectedProperty,
  PropertyType,
} from '../../../shared/ipc';

type SortSpec = NonNullable<DatabaseQuery['sort']>;

type Props = {
  rows: readonly DatabaseRow[];
  groups: readonly DatabaseGroup[];
  totalCount: number;
  /** Property keys to render as columns, in display order. */
  columns: string[];
  /** Active sort (we read the first entry to highlight the column header). */
  sort: SortSpec | undefined;
  /** Optional group key — when set, rows are grouped by `properties[key].value`. */
  groupBy: string | undefined;
  onSortChange(sort: SortSpec): void;
  onRowClick(path: string): void;
};

/**
 * Italian-locale date formatter for `date`-typed cells. Module-scoped so we
 * pay the formatter construction cost once per session, not per cell.
 */
const DATE_FORMATTER = new Intl.DateTimeFormat('it', { dateStyle: 'medium' });

/**
 * Number formatter — Italian locale (decimal comma, dot thousands sep).
 */
const NUMBER_FORMATTER = new Intl.NumberFormat('it');

/** One-letter prefix used in column headers to hint the property type. */
function typeBadge(type: PropertyType | 'title'): string {
  switch (type) {
    case 'title':
      return 'A';
    case 'text':
      return 'T';
    case 'number':
      return '#';
    case 'boolean':
      return '✓';
    case 'date':
      return '📅';
    case 'url':
      return '🔗';
    case 'string-array':
      return '⋯';
    default:
      return '·';
  }
}

/**
 * Heuristic: pick the type to render the column header with, by sampling
 * the first non-null value across rows. We deliberately don't track per-row
 * types — the indexer already validated detection, and a stable header
 * type matches the user's mental model of "this column is a date".
 */
function detectColumnType(rows: readonly DatabaseRow[], key: string): PropertyType | null {
  for (const row of rows) {
    const prop = row.properties[key];
    if (prop !== undefined) return prop.type;
  }
  return null;
}

/**
 * Format the value of a single group key for the group header. We accept
 * `null` (= notes that lack the group key) and surface that as a hint.
 */
function formatGroupValue(value: DatabaseGroup['value']): string {
  if (value === null) return '(senza valore)';
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  if (typeof value === 'number') return NUMBER_FORMATTER.format(value);
  return String(value);
}

/**
 * Returns the row key the table groups by. We accept `boolean` and `number`
 * because `DatabaseGroup.value` does — coerce to a string for keying so
 * the group header lookup is straightforward.
 */
function rowGroupValue(row: DatabaseRow, groupBy: string | undefined): string | null {
  if (groupBy === undefined) return null;
  const prop = row.properties[groupBy];
  if (prop === undefined) return null;
  if (typeof prop.value === 'boolean') return prop.value ? 'true' : 'false';
  if (Array.isArray(prop.value)) {
    // string-array groups would explode by member; for v0.3 we just
    // collapse the whole array to a single key. The adapter mirrors
    // this — `DatabaseGroup.value` is a scalar.
    return prop.value.join(', ');
  }
  return String(prop.value);
}

function groupKeyToString(value: DatabaseGroup['value']): string | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Cell renderer — branches on the detected property type. */
function PropertyCell({ prop }: { prop: DetectedProperty | undefined }): JSX.Element {
  if (prop === undefined) {
    return <span className="text-fg-muted">—</span>;
  }
  switch (prop.type) {
    case 'text':
      return <span className="truncate">{prop.value}</span>;
    case 'number':
      return (
        <span className="block text-right tabular-nums">{NUMBER_FORMATTER.format(prop.value)}</span>
      );
    case 'boolean':
      return (
        <span aria-label={prop.value ? 'vero' : 'falso'} className="text-fg-subtle">
          {prop.value ? '✓' : '✗'}
        </span>
      );
    case 'date': {
      // The indexer normalises to YYYY-MM-DD; constructing a Date from that
      // is timezone-safe (UTC midnight) and `Intl` formats it in the user's
      // locale.
      const d = new Date(`${prop.value}T00:00:00Z`);
      const label = Number.isNaN(d.getTime()) ? prop.value : DATE_FORMATTER.format(d);
      return <span className="truncate">{label}</span>;
    }
    case 'url':
      return (
        <a
          href={prop.value}
          target="_blank"
          rel="noreferrer"
          // Stop the row-click from firing when the user clicks the link.
          onClick={(e): void => e.stopPropagation()}
          className="truncate text-accent hover:underline"
        >
          {prop.value}
        </a>
      );
    case 'string-array':
      if (prop.value.length === 0) return <span className="text-fg-muted">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {prop.value.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="rounded bg-bg-muted px-1.5 py-0.5 text-[11px] text-fg-subtle"
            >
              {v}
            </span>
          ))}
        </span>
      );
    default:
      return <span className="text-fg-muted">—</span>;
  }
}

/**
 * Sortable column header. Clicking toggles asc/desc for that key; clicking
 * a different key resets to asc.
 */
function HeaderCell({
  label,
  sortKey,
  sortType,
  activeKey,
  activeDirection,
  onSortChange,
  align,
}: {
  label: string;
  sortKey: string;
  sortType: PropertyType | 'title';
  activeKey: string | null;
  activeDirection: 'asc' | 'desc' | null;
  onSortChange(sort: SortSpec): void;
  align?: 'left' | 'right';
}): JSX.Element {
  const isActive = activeKey === sortKey;
  const arrow = isActive ? (activeDirection === 'asc' ? '▲' : '▼') : null;
  const handleClick = (): void => {
    const next: 'asc' | 'desc' = isActive && activeDirection === 'asc' ? 'desc' : 'asc';
    onSortChange([{ key: sortKey, direction: next }]);
  };
  return (
    <th
      scope="col"
      className={clsx(
        'sticky top-0 z-10 select-none border-b border-border bg-bg-subtle px-2 py-1.5 text-xs font-semibold text-fg-subtle',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className={clsx(
          'flex w-full items-center gap-1 hover:text-fg',
          align === 'right' ? 'justify-end' : 'justify-start',
          isActive && 'text-fg',
        )}
        title={`Ordina per ${label}`}
      >
        <span aria-hidden="true" className="text-[10px] text-fg-muted">
          {typeBadge(sortType)}
        </span>
        <span className="truncate">{label}</span>
        {arrow !== null && <span className="text-[10px]">{arrow}</span>}
      </button>
    </th>
  );
}

/**
 * Main table renderer for the database view. Renders a sticky-header table
 * with optional group separators. Click a row → caller's `onRowClick`.
 *
 * Column visibility is controlled by the `columns` prop (caller decides);
 * the Title column is always rendered as the first column.
 */
export function Table({
  rows,
  groups,
  totalCount,
  columns,
  sort,
  groupBy,
  onSortChange,
  onRowClick,
}: Props): JSX.Element {
  const activeSort = sort?.[0] ?? null;
  const activeKey = activeSort?.key ?? null;
  const activeDirection = activeSort?.direction ?? null;

  // Pre-compute per-column type once so we don't traverse rows per cell.
  const columnTypes = new Map<string, PropertyType | null>();
  for (const key of columns) {
    columnTypes.set(key, detectColumnType(rows, key));
  }

  // Build a lookup of group-key → count for the group header rows. The
  // adapter returns groups in the order the SQL backend chose; we render
  // them in that order to keep determinism.
  const groupCounts = new Map<string | null, number>();
  for (const g of groups) {
    groupCounts.set(groupKeyToString(g.value), g.count);
  }

  // Bucket rows by group key when groupBy is active. Maintain insertion
  // order so rows show up under the first group header that matches.
  const grouped: Array<{ key: string | null; rows: readonly DatabaseRow[] }> = [];
  if (groupBy !== undefined) {
    const buckets = new Map<string | null, DatabaseRow[]>();
    // Seed buckets from the adapter-provided group order so empty groups
    // (count > 0 but rows truncated by limit) still appear.
    for (const g of groups) {
      buckets.set(groupKeyToString(g.value), []);
    }
    for (const row of rows) {
      const key = rowGroupValue(row, groupBy);
      const bucket = buckets.get(key);
      if (bucket !== undefined) {
        bucket.push(row);
      } else {
        // The group wasn't reported by the adapter (shouldn't happen, but
        // be defensive — render under a fresh bucket so rows don't drop).
        buckets.set(key, [row]);
      }
    }
    for (const [key, bucketRows] of buckets) {
      grouped.push({ key, rows: bucketRows });
    }
  }

  const totalColumns = columns.length + 1; // +1 for title

  const noColumns = columns.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <HeaderCell
                label="Titolo"
                sortKey="title"
                sortType="title"
                activeKey={activeKey}
                activeDirection={activeDirection}
                onSortChange={onSortChange}
              />
              {columns.map((key) => {
                const t = columnTypes.get(key) ?? null;
                return (
                  <HeaderCell
                    key={key}
                    label={key}
                    sortKey={key}
                    sortType={t ?? 'text'}
                    activeKey={activeKey}
                    activeDirection={activeDirection}
                    onSortChange={onSortChange}
                    align={t === 'number' ? 'right' : 'left'}
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupBy !== undefined &&
              grouped.map(({ key, rows: bucketRows }) => {
                const headerLabel =
                  key === null
                    ? formatGroupValue(null)
                    : formatGroupValue(
                        // Echo what the adapter reported when possible (preserves
                        // boolean/number formatting); fall back to the raw key.
                        groups.find((g) => groupKeyToString(g.value) === key)?.value ?? key,
                      );
                const count = groupCounts.get(key) ?? bucketRows.length;
                return (
                  <GroupSection
                    // Prefix the React key with `v:` so a literal `null`
                    // sentinel can't collide with a user-supplied tag
                    // value of `"null"`. The null bucket gets `n:` so it
                    // can't collide with anything.
                    key={key === null ? 'n:' : `v:${key}`}
                    label={headerLabel}
                    count={count}
                    columnsSpan={totalColumns}
                    rows={bucketRows}
                    columns={columns}
                    columnTypes={columnTypes}
                    onRowClick={onRowClick}
                  />
                );
              })}
            {groupBy === undefined &&
              rows.map((row) => (
                <RowItem
                  key={row.path}
                  row={row}
                  columns={columns}
                  columnTypes={columnTypes}
                  onRowClick={onRowClick}
                />
              ))}
          </tbody>
        </table>
        {noColumns && rows.length > 0 && (
          <p className="px-3 py-3 text-xs text-fg-muted">
            Aggiungi <code>tags:</code>, <code>status:</code>, ecc. nel frontmatter delle note per
            vedere più colonne.
          </p>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-bg-subtle px-3 py-1.5 text-xs text-fg-muted">
        {rows.length === totalCount ? (
          <span>
            {totalCount} {totalCount === 1 ? 'nota' : 'note'}
          </span>
        ) : (
          <span>
            {rows.length} di {totalCount} note
          </span>
        )}
      </div>
    </div>
  );
}

function GroupSection({
  label,
  count,
  columnsSpan,
  rows,
  columns,
  columnTypes,
  onRowClick,
}: {
  label: string;
  count: number;
  columnsSpan: number;
  rows: readonly DatabaseRow[];
  columns: string[];
  columnTypes: Map<string, PropertyType | null>;
  onRowClick(path: string): void;
}): JSX.Element {
  return (
    <>
      <tr>
        <td
          colSpan={columnsSpan}
          className="border-b border-border bg-bg-muted px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Gruppo: {label} ({count})
        </td>
      </tr>
      {rows.map((row) => (
        <RowItem
          key={row.path}
          row={row}
          columns={columns}
          columnTypes={columnTypes}
          onRowClick={onRowClick}
        />
      ))}
    </>
  );
}

function RowItem({
  row,
  columns,
  columnTypes,
  onRowClick,
}: {
  row: DatabaseRow;
  columns: string[];
  columnTypes: Map<string, PropertyType | null>;
  onRowClick(path: string): void;
}): JSX.Element {
  return (
    <tr
      onClick={(): void => onRowClick(row.path)}
      onKeyDown={(e): void => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(row.path);
        }
      }}
      tabIndex={0}
      role="link"
      title={row.path}
      className="h-8 cursor-pointer border-b border-border hover:bg-bg-muted focus:bg-bg-muted focus:outline-none"
    >
      <td className="max-w-[320px] truncate px-2 py-1 align-middle text-fg">{row.title}</td>
      {columns.map((key) => {
        const t = columnTypes.get(key) ?? null;
        return (
          <td
            key={key}
            className={clsx(
              'max-w-[280px] truncate px-2 py-1 align-middle text-fg-subtle',
              t === 'number' && 'text-right',
            )}
          >
            <PropertyCell prop={row.properties[key]} />
          </td>
        );
      })}
    </tr>
  );
}
