// Pure helpers for the BoardView. Kept framework-free so they can be
// unit-tested without React or jsdom — the view component composes them
// to derive columns from rows / groups, find the "secondary" property to
// surface on a card, and produce a frontmatter patch when a card moves
// from one column to another.
//
// The shapes here intentionally mirror what `useDatabaseStore` exposes
// (`DatabaseRow`, `DatabaseGroup`, `DetectedProperty`); we don't widen
// or re-define them so a refactor in core ripples through naturally.

import type { Frontmatter } from '@synapsium/core';
import type { DatabaseGroup, DatabaseRow, DetectedProperty } from '../../../../shared/ipc';

/** Sentinel id used by the column that holds notes lacking the groupBy key. */
export const NULL_COLUMN_ID = '__synapsium_null__';

/** Italian-locale label used wherever we surface the null bucket. */
export const NULL_COLUMN_LABEL = '(senza valore)';

/**
 * One column in the kanban board. `id` is the routing key used by
 * drag-and-drop and React keys; `value` is the raw property value the
 * column represents (used when computing the frontmatter patch on drop).
 *
 * `value === null` is reserved for the catch-all bucket — i.e. notes
 * whose `properties[groupBy]` is missing.
 */
export type BoardColumn = {
  id: string;
  label: string;
  value: string | number | boolean | null;
  rows: DatabaseRow[];
};

/**
 * Stringify a {@link DatabaseGroup}-style scalar to a stable column id.
 * We use the same encoding for boolean/number so look-ups by id remain
 * O(1) regardless of the underlying property type.
 */
export function valueToColumnId(value: string | number | boolean | null): string {
  if (value === null) return NULL_COLUMN_ID;
  if (typeof value === 'boolean') return value ? 'b:true' : 'b:false';
  if (typeof value === 'number') return `n:${value}`;
  return `s:${value}`;
}

/**
 * Human-readable label for a column header. Mirrors the formatter used
 * by the table view's group separators so the two views agree on copy.
 */
export function formatColumnLabel(value: string | number | boolean | null): string {
  if (value === null) return NULL_COLUMN_LABEL;
  if (typeof value === 'boolean') return value ? 'Sì' : 'No';
  return String(value);
}

/**
 * The property type the board treats `groupBy` as. Detected by sampling
 * the first row that has a value for `groupBy`. We deliberately match
 * the table view's heuristic — the indexer guarantees per-key types are
 * stable across rows for any given vault, so a single sample is enough.
 *
 * Returns `null` when no row has the key (the board renders just the
 * "(senza valore)" column in that case).
 */
export function detectGroupType(
  rows: DatabaseRow[],
  groupBy: string,
): DetectedProperty['type'] | null {
  for (const row of rows) {
    const prop = row.properties[groupBy];
    if (prop !== undefined) return prop.type;
  }
  return null;
}

/**
 * Compute every column id a row should appear in for a given `groupBy`.
 * Returns one id for scalar property types (text/number/boolean/date/url)
 * and one id per array entry for `string-array`. Rows without the key
 * land in the "(senza valore)" column.
 *
 * Multi-select semantics: a row tagged `[a, b, c]` shows up in three
 * columns. This matches Notion's board-by-multi-select behaviour and
 * is why drag-from-multi-select doesn't replace — see
 * {@link buildFrontmatterAfterMove}.
 */
export function rowColumnIds(row: DatabaseRow, groupBy: string): string[] {
  const prop = row.properties[groupBy];
  if (prop === undefined) return [NULL_COLUMN_ID];
  if (prop.type === 'string-array') {
    if (prop.value.length === 0) return [NULL_COLUMN_ID];
    return prop.value.map((v) => valueToColumnId(v));
  }
  return [valueToColumnId(prop.value)];
}

/**
 * Build the ordered list of board columns from a query result.
 *
 * Ordering rules:
 *   1. Columns derived from `result.groups` come first, in the order the
 *      adapter returned them (already sorted by descending count).
 *   2. The "(senza valore)" column is appended last and ALWAYS rendered,
 *      even when no rows lack the key — this gives the user a drop
 *      target to clear the property.
 *   3. For `string-array`, the adapter's `groups` bundle the JSON-
 *      encoded array as a single value (see `groupRowToValue` in the
 *      sqlite adapter). That's not what we want on a board where each
 *      tag is its own column, so we re-derive the columns from the rows
 *      and order alphabetically. The `groups` array is ignored for that
 *      property type.
 *
 * Empty columns (count > 0 but truncated by limit, or zero rows) are
 * still rendered so the user can drop into them.
 */
export function buildColumns(
  rows: DatabaseRow[],
  groups: DatabaseGroup[],
  groupBy: string,
): BoardColumn[] {
  const groupType = detectGroupType(rows, groupBy);

  // For string-array, derive distinct values from rows directly. The
  // adapter's `groups` would give us JSON-encoded array strings, which
  // is the wrong granularity here.
  if (groupType === 'string-array') {
    const valueOrder = new Map<string, number>();
    let counter = 0;
    for (const row of rows) {
      const prop = row.properties[groupBy];
      if (prop === undefined || prop.type !== 'string-array') continue;
      for (const v of prop.value) {
        if (!valueOrder.has(v)) {
          valueOrder.set(v, counter++);
        }
      }
    }
    const sorted = Array.from(valueOrder.keys()).sort((a, b) => a.localeCompare(b));

    const columns: BoardColumn[] = sorted.map((v) => ({
      id: valueToColumnId(v),
      label: formatColumnLabel(v),
      value: v,
      rows: [],
    }));

    // Always include the null bucket as the last column, even when zero
    // rows lack the key — drag-to-clear needs a drop target.
    columns.push({
      id: NULL_COLUMN_ID,
      label: NULL_COLUMN_LABEL,
      value: null,
      rows: [],
    });

    distributeRows(rows, groupBy, columns);
    return columns;
  }

  // Scalar types: trust the adapter's `groups` ordering, then ensure the
  // null column trails. Rows with values that DON'T appear in `groups`
  // (shouldn't happen, but defensively) are bucketed into a fresh column
  // so they don't disappear.
  const seenIds = new Set<string>();
  const columns: BoardColumn[] = [];
  let nullColumn: BoardColumn | null = null;

  for (const g of groups) {
    if (g.value === null) {
      // The adapter may emit a null bucket. We still defer it to the end.
      nullColumn = {
        id: NULL_COLUMN_ID,
        label: NULL_COLUMN_LABEL,
        value: null,
        rows: [],
      };
      seenIds.add(NULL_COLUMN_ID);
      continue;
    }
    const id = valueToColumnId(g.value);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    columns.push({
      id,
      label: formatColumnLabel(g.value),
      value: g.value,
      rows: [],
    });
  }

  if (nullColumn === null) {
    nullColumn = {
      id: NULL_COLUMN_ID,
      label: NULL_COLUMN_LABEL,
      value: null,
      rows: [],
    };
  }
  columns.push(nullColumn);

  distributeRows(rows, groupBy, columns);
  return columns;
}

/**
 * Place each row into the columns it belongs to. Handles unexpected
 * values (a row whose `properties[groupBy].value` doesn't match any
 * column) by appending a fresh column to the end so we don't drop
 * data. We deliberately mutate `columns` in-place so `buildColumns` can
 * keep its single allocation pattern.
 */
function distributeRows(rows: DatabaseRow[], groupBy: string, columns: BoardColumn[]): void {
  const byId = new Map<string, BoardColumn>();
  for (const c of columns) byId.set(c.id, c);

  for (const row of rows) {
    const ids = rowColumnIds(row, groupBy);
    for (const id of ids) {
      let col = byId.get(id);
      if (col === undefined) {
        // Fresh column for an orphan value; insert before the null bucket
        // so the trailing-null invariant holds.
        const prop = row.properties[groupBy];
        const value =
          prop !== undefined && prop.type !== 'string-array'
            ? prop.value
            : id === NULL_COLUMN_ID
              ? null
              : id.startsWith('s:')
                ? id.slice(2)
                : null;
        col = {
          id,
          label: formatColumnLabel(value),
          value,
          rows: [],
        };
        const nullIdx = columns.findIndex((c) => c.id === NULL_COLUMN_ID);
        if (nullIdx >= 0) {
          columns.splice(nullIdx, 0, col);
        } else {
          columns.push(col);
        }
        byId.set(id, col);
      }
      col.rows.push(row);
    }
  }
}

/**
 * Pick a "secondary" property key to display on each card under the
 * title. Heuristic, deliberately simple:
 *   - never picks the active `groupBy` key
 *   - picks the property key that appears on the most rows (i.e. the
 *     densest column from the user's perspective)
 *   - ties broken by alphabetical order for determinism
 *
 * Returns `null` when no candidate exists. Rendering branches on this:
 * a card without a secondary just shows the title.
 */
export function pickSecondaryPropertyKey(rows: DatabaseRow[], groupBy: string): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const key of Object.keys(row.properties)) {
      if (key === groupBy) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  let bestKey: string | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && bestKey !== null && key.localeCompare(bestKey) < 0)
    ) {
      bestKey = key;
      bestCount = count;
    }
  }
  return bestKey;
}

/**
 * Compute the new frontmatter for a row when its card is dropped on a
 * different column. Pure: same row + same column → same patch.
 *
 * Rules per property type:
 *   - `string-array`: append the new column's value; remove the
 *     `fromColumn` value if present. Drop-onto-null clears the property.
 *   - scalar (text/number/boolean/date/url): replace the value.
 *     Drop-onto-null deletes the key from the frontmatter.
 *
 * Returns `null` to signal a no-op (e.g. dragging onto the same column,
 * or dragging a string-array card onto a column whose value is already
 * present in the array). Callers skip the IPC round-trip in that case.
 */
export function buildFrontmatterAfterMove(args: {
  row: DatabaseRow;
  groupBy: string;
  fromColumnId: string;
  toColumn: BoardColumn;
}): Frontmatter | null {
  const { row, groupBy, fromColumnId, toColumn } = args;

  // Same column → no-op. The view also short-circuits on this, but
  // returning `null` here makes the helper safe to call unconditionally.
  if (fromColumnId === toColumn.id) return null;

  // We only have access to the row's indexed projection here, not its
  // raw on-disk frontmatter. So this helper returns just a partial patch
  // (one key — the one we're moving) plus a sentinel for deletion; the
  // caller is responsible for loading the note's frontmatter and merging
  // via {@link applyFrontmatterPatch}.
  const prop = row.properties[groupBy];
  const isArray = prop?.type === 'string-array';

  if (isArray) {
    const current = prop.value;
    if (toColumn.value === null) {
      // Drop on null bucket: clear the property entirely.
      return { [groupBy]: PATCH_DELETE };
    }
    const target = toColumn.value;
    if (typeof target !== 'string') {
      // string-array columns always carry string values — defensive guard.
      return null;
    }
    // No-op when target already present AND the source isn't a real
    // column (e.g. user drags between two columns the row appears in).
    const hasTarget = current.includes(target);
    // Source value: try to derive from the source column id. We accept
    // 's:<value>' strings; null bucket means "no source to remove".
    const sourceValue = fromColumnId === NULL_COLUMN_ID ? null : decodeStringColumnId(fromColumnId);
    let nextArr = current.slice();
    if (sourceValue !== null) {
      nextArr = nextArr.filter((v) => v !== sourceValue);
    }
    if (!hasTarget) {
      nextArr.push(target);
    } else if (sourceValue === null) {
      // Target already there and we couldn't remove a source → no-op.
      return null;
    }
    return { [groupBy]: nextArr };
  }

  // Scalar property. Drop on null bucket clears; otherwise replace.
  if (toColumn.value === null) {
    return { [groupBy]: PATCH_DELETE };
  }
  return { [groupBy]: toColumn.value };
}

/**
 * Sentinel signalling "delete this key" in a partial frontmatter patch.
 * Plain `undefined` would also work but `JSON.stringify` strips it; the
 * sentinel survives any round-trip and is matched explicitly by
 * {@link applyFrontmatterPatch}.
 */
export const PATCH_DELETE: unique symbol = Symbol('patch-delete');

/**
 * Apply a patch produced by {@link buildFrontmatterAfterMove} on top of
 * the on-disk frontmatter. Keys mapped to {@link PATCH_DELETE} are
 * removed; everything else is overwritten.
 */
export function applyFrontmatterPatch(base: Frontmatter, patch: Frontmatter): Frontmatter {
  const out: Frontmatter = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === PATCH_DELETE) {
      delete out[k];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Decode a `valueToColumnId` string back to its underlying string value.
 * Only handles the `s:` prefix (the only column type that carries a
 * string-array member); returns `null` for anything else.
 */
function decodeStringColumnId(id: string): string | null {
  if (id.startsWith('s:')) return id.slice(2);
  return null;
}
