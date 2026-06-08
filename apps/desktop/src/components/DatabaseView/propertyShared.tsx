// Shared property-type vocabulary for the database views (Table / Board /
// Calendar / Gallery). Extracted so the four layouts agree on type icons,
// locale formatters, and cell rendering instead of each re-implementing
// its own. Keeping one source of truth here is what makes the views feel
// consistent — a date renders the same in a table cell, a board card, and
// a gallery card.

import type { JSX } from 'react';
import type { DetectedProperty, PropertyType } from '../../../shared/ipc';

/**
 * Italian-locale date formatter for `date`-typed values. Module-scoped so
 * the formatter construction cost is paid once per session, not per cell.
 */
export const DATE_FORMATTER = new Intl.DateTimeFormat('it', { dateStyle: 'medium' });

/** Italian-locale number formatter (decimal comma, dot thousands sep). */
export const NUMBER_FORMATTER = new Intl.NumberFormat('it');

/**
 * One-glyph hint for a property type, shown next to column headers and
 * card property labels. A single shared mapping keeps the type language
 * identical across every layout.
 */
export function typeBadge(type: PropertyType | 'title'): string {
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
 * Format a `date`-typed value (ISO YYYY-MM-DD) for display. The indexer
 * normalises to YYYY-MM-DD; constructing a Date from that is timezone-safe
 * (UTC midnight) and `Intl` formats it in the user's locale. Falls back to
 * the raw string when the value isn't a parseable date.
 */
export function formatDateValue(value: string): string {
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? value : DATE_FORMATTER.format(d);
}

/**
 * Detect the type to render a column/property with, by sampling the first
 * non-null value across rows. We deliberately don't track per-row types —
 * the indexer already validated detection, and a stable type matches the
 * user's mental model of "this property is a date".
 */
export function detectPropertyType(
  rows: ReadonlyArray<{ properties: Record<string, DetectedProperty> }>,
  key: string,
): PropertyType | null {
  for (const row of rows) {
    const prop = row.properties[key];
    if (prop !== undefined) return prop.type;
  }
  return null;
}

/**
 * Compact, read-only renderer for a single property value. Branches on the
 * detected type and mirrors the table cell's visual language so a value
 * looks the same wherever it appears. `undefined` (missing key) renders a
 * muted em-dash placeholder.
 */
export function PropertyValueView({ prop }: { prop: DetectedProperty | undefined }): JSX.Element {
  if (prop === undefined) {
    return <span className="text-fg-muted">—</span>;
  }
  switch (prop.type) {
    case 'text':
      return <span className="truncate">{prop.value}</span>;
    case 'number':
      return <span className="tabular-nums">{NUMBER_FORMATTER.format(prop.value)}</span>;
    case 'boolean':
      return (
        <span aria-label={prop.value ? 'vero' : 'falso'} className="text-fg-subtle">
          {prop.value ? '✓' : '✗'}
        </span>
      );
    case 'date':
      return <span className="truncate">{formatDateValue(prop.value)}</span>;
    case 'url':
      return (
        <a
          href={prop.value}
          target="_blank"
          rel="noreferrer"
          // Stop the card/row open from firing when the user clicks the link.
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
