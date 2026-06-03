import type { NotePath } from '@ziba/core';
import type { DatabaseRow } from '../../../shared/ipc';

type Props = {
  rows: readonly DatabaseRow[];
  columns: readonly string[];
  onRowClick(path: NotePath): void;
};

function propertyValue(row: DatabaseRow, key: string): string | null {
  const property = row.properties[key];
  if (property === undefined) return null;
  if (Array.isArray(property.value)) return property.value.join(', ');
  return String(property.value);
}

export function GalleryView({ rows, columns, onRowClick }: Props): JSX.Element {
  return (
    <div className="h-full overflow-auto p-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
        {rows.map((row) => (
          <button
            key={row.path}
            type="button"
            onClick={(): void => onRowClick(row.path)}
            className="min-h-28 rounded border border-border bg-bg-subtle p-3 text-left transition hover:border-accent/50 hover:bg-bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title={row.path}
          >
            <span className="block truncate text-sm font-medium text-fg">{row.title}</span>
            <span className="mt-1 block truncate font-mono text-[10px] text-fg-muted">
              {row.path}
            </span>
            <span className="mt-3 block space-y-1">
              {columns.slice(0, 4).map((column) => {
                const value = propertyValue(row, column);
                if (value === null) return null;
                return (
                  <span key={column} className="flex min-w-0 items-baseline gap-1 text-xs">
                    <span className="shrink-0 text-fg-muted">{column}</span>
                    <span className="truncate text-fg-subtle">{value}</span>
                  </span>
                );
              })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
