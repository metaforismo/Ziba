import { describe, expect, it } from 'vitest';
import type { DatabaseGroup, DatabaseRow, DetectedProperty } from '../../../../shared/ipc';
import {
  applyFrontmatterPatch,
  buildColumns,
  buildFrontmatterAfterMove,
  detectGroupType,
  formatColumnLabel,
  NULL_COLUMN_ID,
  NULL_COLUMN_LABEL,
  PATCH_DELETE,
  pickSecondaryPropertyKey,
  rowColumnIds,
  valueToColumnId,
} from './helpers';

// Tiny factories so the test bodies focus on intent. Keys are detected
// per-row so we just construct `DetectedProperty`s directly.
function prop(key: string, type: DetectedProperty['type'], value: unknown): DetectedProperty {
  return { key, type, value } as DetectedProperty;
}
function row(path: string, props: Record<string, DetectedProperty>): DatabaseRow {
  return { path, title: path.replace('.md', ''), mtimeMs: 0, properties: props };
}

describe('valueToColumnId', () => {
  it('encodes scalars with type prefixes', () => {
    expect(valueToColumnId(null)).toBe(NULL_COLUMN_ID);
    expect(valueToColumnId(true)).toBe('b:true');
    expect(valueToColumnId(false)).toBe('b:false');
    expect(valueToColumnId(42)).toBe('n:42');
    expect(valueToColumnId('todo')).toBe('s:todo');
  });
});

describe('formatColumnLabel', () => {
  it('formats null and booleans with Italian copy', () => {
    expect(formatColumnLabel(null)).toBe(NULL_COLUMN_LABEL);
    expect(formatColumnLabel(true)).toBe('Sì');
    expect(formatColumnLabel(false)).toBe('No');
    expect(formatColumnLabel('done')).toBe('done');
    expect(formatColumnLabel(7)).toBe('7');
  });
});

describe('detectGroupType', () => {
  it('returns null when no row carries the key', () => {
    const rows = [row('a.md', { other: prop('other', 'text', 'x') })];
    expect(detectGroupType(rows, 'status')).toBeNull();
  });

  it('returns the first observed type', () => {
    const rows = [row('a.md', {}), row('b.md', { status: prop('status', 'text', 'todo') })];
    expect(detectGroupType(rows, 'status')).toBe('text');
  });
});

describe('rowColumnIds', () => {
  it('returns the null sentinel for missing key', () => {
    expect(rowColumnIds(row('a.md', {}), 'status')).toEqual([NULL_COLUMN_ID]);
  });

  it('returns one id for scalar types', () => {
    const r = row('a.md', { status: prop('status', 'text', 'todo') });
    expect(rowColumnIds(r, 'status')).toEqual(['s:todo']);
  });

  it('returns one id per element for string-array', () => {
    const r = row('a.md', { tags: prop('tags', 'string-array', ['a', 'b', 'c']) });
    expect(rowColumnIds(r, 'tags')).toEqual(['s:a', 's:b', 's:c']);
  });

  it('returns null bucket for an empty string-array', () => {
    const r = row('a.md', { tags: prop('tags', 'string-array', []) });
    expect(rowColumnIds(r, 'tags')).toEqual([NULL_COLUMN_ID]);
  });
});

describe('buildColumns — scalar groupBy', () => {
  it('orders columns from the adapter and trails the null bucket', () => {
    const rows = [
      row('a.md', { status: prop('status', 'text', 'todo') }),
      row('b.md', { status: prop('status', 'text', 'doing') }),
      row('c.md', {}),
    ];
    const groups: DatabaseGroup[] = [
      { value: 'todo', count: 1 },
      { value: 'doing', count: 1 },
      { value: null, count: 1 },
    ];
    const cols = buildColumns(rows, groups, 'status');
    expect(cols.map((c) => c.id)).toEqual(['s:todo', 's:doing', NULL_COLUMN_ID]);
    expect(cols[0]?.rows.map((r) => r.path)).toEqual(['a.md']);
    expect(cols[1]?.rows.map((r) => r.path)).toEqual(['b.md']);
    expect(cols[2]?.rows.map((r) => r.path)).toEqual(['c.md']);
  });

  it('always renders the null column even with no null rows', () => {
    const rows = [row('a.md', { status: prop('status', 'text', 'todo') })];
    const groups: DatabaseGroup[] = [{ value: 'todo', count: 1 }];
    const cols = buildColumns(rows, groups, 'status');
    expect(cols.at(-1)?.id).toBe(NULL_COLUMN_ID);
    expect(cols.at(-1)?.rows).toEqual([]);
  });

  it('handles boolean and number group values', () => {
    const rows = [
      row('a.md', { done: prop('done', 'boolean', true) }),
      row('b.md', { done: prop('done', 'boolean', false) }),
    ];
    const groups: DatabaseGroup[] = [
      { value: true, count: 1 },
      { value: false, count: 1 },
    ];
    const cols = buildColumns(rows, groups, 'done');
    expect(cols.map((c) => c.id)).toEqual(['b:true', 'b:false', NULL_COLUMN_ID]);
    expect(cols[0]?.rows.map((r) => r.path)).toEqual(['a.md']);
    expect(cols[1]?.rows.map((r) => r.path)).toEqual(['b.md']);
  });
});

describe('buildColumns — string-array groupBy (multi-select)', () => {
  it('renders one column per unique tag, alphabetically', () => {
    const rows = [
      row('a.md', { tags: prop('tags', 'string-array', ['urgent', 'work']) }),
      row('b.md', { tags: prop('tags', 'string-array', ['home', 'urgent']) }),
    ];
    // Adapter would emit JSON-encoded values; we ignore them on
    // purpose and re-derive from rows.
    const cols = buildColumns(rows, [], 'tags');
    expect(cols.map((c) => c.id)).toEqual(['s:home', 's:urgent', 's:work', NULL_COLUMN_ID]);
  });

  it('places a row in every matching column', () => {
    const rows = [
      row('a.md', { tags: prop('tags', 'string-array', ['x', 'y']) }),
      row('b.md', { tags: prop('tags', 'string-array', ['y']) }),
    ];
    const cols = buildColumns(rows, [], 'tags');
    const byId = Object.fromEntries(cols.map((c) => [c.id, c.rows.map((r) => r.path)]));
    expect(byId['s:x']).toEqual(['a.md']);
    expect(byId['s:y']).toEqual(['a.md', 'b.md']);
  });

  it('puts rows with no value under the null column', () => {
    const rows = [row('a.md', {}), row('b.md', { tags: prop('tags', 'string-array', ['x']) })];
    const cols = buildColumns(rows, [], 'tags');
    const nullCol = cols.find((c) => c.id === NULL_COLUMN_ID);
    expect(nullCol?.rows.map((r) => r.path)).toEqual(['a.md']);
  });
});

describe('pickSecondaryPropertyKey', () => {
  it('returns null when no secondary candidates exist', () => {
    const rows = [row('a.md', { status: prop('status', 'text', 'todo') })];
    expect(pickSecondaryPropertyKey(rows, 'status')).toBeNull();
  });

  it('picks the densest non-groupBy key', () => {
    const rows = [
      row('a.md', {
        status: prop('status', 'text', 'todo'),
        priority: prop('priority', 'text', 'high'),
        tags: prop('tags', 'string-array', ['a']),
      }),
      row('b.md', {
        status: prop('status', 'text', 'todo'),
        priority: prop('priority', 'text', 'low'),
      }),
    ];
    expect(pickSecondaryPropertyKey(rows, 'status')).toBe('priority');
  });

  it('breaks ties alphabetically (earliest first)', () => {
    const rows = [
      row('a.md', {
        status: prop('status', 'text', 'todo'),
        zeta: prop('zeta', 'text', 'a'),
        alpha: prop('alpha', 'text', 'b'),
      }),
    ];
    expect(pickSecondaryPropertyKey(rows, 'status')).toBe('alpha');
  });
});

describe('buildFrontmatterAfterMove', () => {
  it('returns null when source and target are the same', () => {
    const r = row('a.md', { status: prop('status', 'text', 'todo') });
    const patch = buildFrontmatterAfterMove({
      row: r,
      groupBy: 'status',
      fromColumnId: 's:todo',
      toColumn: { id: 's:todo', label: 'todo', value: 'todo', rows: [] },
    });
    expect(patch).toBeNull();
  });

  describe('scalar', () => {
    it('replaces the value', () => {
      const r = row('a.md', { status: prop('status', 'text', 'todo') });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'status',
        fromColumnId: 's:todo',
        toColumn: { id: 's:doing', label: 'doing', value: 'doing', rows: [] },
      });
      expect(patch).toEqual({ status: 'doing' });
    });

    it('deletes the key when dropped on null bucket', () => {
      const r = row('a.md', { status: prop('status', 'text', 'todo') });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'status',
        fromColumnId: 's:todo',
        toColumn: { id: NULL_COLUMN_ID, label: NULL_COLUMN_LABEL, value: null, rows: [] },
      });
      expect(patch).toEqual({ status: PATCH_DELETE });
    });

    it('replaces the key when row had no value (null → scalar)', () => {
      const r = row('a.md', {});
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'status',
        fromColumnId: NULL_COLUMN_ID,
        toColumn: { id: 's:doing', label: 'doing', value: 'doing', rows: [] },
      });
      expect(patch).toEqual({ status: 'doing' });
    });
  });

  describe('string-array (multi-select)', () => {
    it('replaces the source tag with the target tag', () => {
      const r = row('a.md', { tags: prop('tags', 'string-array', ['a', 'b']) });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'tags',
        fromColumnId: 's:a',
        toColumn: { id: 's:c', label: 'c', value: 'c', rows: [] },
      });
      expect(patch).toEqual({ tags: ['b', 'c'] });
    });

    it('adds the target when source is the null bucket', () => {
      const r = row('a.md', { tags: prop('tags', 'string-array', ['a']) });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'tags',
        fromColumnId: NULL_COLUMN_ID,
        toColumn: { id: 's:b', label: 'b', value: 'b', rows: [] },
      });
      expect(patch).toEqual({ tags: ['a', 'b'] });
    });

    it('returns null when target tag already present and source is null bucket', () => {
      const r = row('a.md', { tags: prop('tags', 'string-array', ['a', 'b']) });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'tags',
        fromColumnId: NULL_COLUMN_ID,
        toColumn: { id: 's:b', label: 'b', value: 'b', rows: [] },
      });
      expect(patch).toBeNull();
    });

    it('removes source even when target already present (move-out)', () => {
      const r = row('a.md', { tags: prop('tags', 'string-array', ['a', 'b']) });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'tags',
        fromColumnId: 's:a',
        toColumn: { id: 's:b', label: 'b', value: 'b', rows: [] },
      });
      expect(patch).toEqual({ tags: ['b'] });
    });

    it('clears the entire array when dropped on null bucket', () => {
      const r = row('a.md', { tags: prop('tags', 'string-array', ['a', 'b']) });
      const patch = buildFrontmatterAfterMove({
        row: r,
        groupBy: 'tags',
        fromColumnId: 's:a',
        toColumn: { id: NULL_COLUMN_ID, label: NULL_COLUMN_LABEL, value: null, rows: [] },
      });
      expect(patch).toEqual({ tags: PATCH_DELETE });
    });
  });
});

describe('applyFrontmatterPatch', () => {
  it('overwrites scalar keys', () => {
    const merged = applyFrontmatterPatch({ status: 'todo', title: 'Note' }, { status: 'doing' });
    expect(merged).toEqual({ status: 'doing', title: 'Note' });
  });

  it('deletes keys mapped to PATCH_DELETE', () => {
    const merged = applyFrontmatterPatch(
      { status: 'todo', title: 'Note' },
      { status: PATCH_DELETE },
    );
    expect(merged).toEqual({ title: 'Note' });
  });

  it('does not mutate the input', () => {
    const base = { status: 'todo' };
    const before = JSON.stringify(base);
    applyFrontmatterPatch(base, { status: 'doing' });
    expect(JSON.stringify(base)).toBe(before);
  });

  it('overwrites with arrays (string-array)', () => {
    const merged = applyFrontmatterPatch({ tags: ['a', 'b'], title: 'Note' }, { tags: ['c'] });
    expect(merged).toEqual({ tags: ['c'], title: 'Note' });
  });
});
