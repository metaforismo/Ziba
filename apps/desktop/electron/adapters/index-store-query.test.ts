import { describe, expect, it } from 'vitest';
import {
  buildFilterFragment,
  buildSortClause,
  buildWhereFragments,
  clampQueryLimit,
  columnForRhs,
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
} from './index-store-query';

// Tests for the SQL fragment builders pulled out of
// `index-store.sqlite.ts`. The adapter itself is exercised in-app —
// these specs pin the pure shaping logic so refactors can't silently
// regress the SQL the database actually receives.

describe('columnForRhs', () => {
  it('routes booleans to boolean_value as 0/1', () => {
    expect(columnForRhs(true)).toEqual({ column: 'boolean_value', bound: 1 });
    expect(columnForRhs(false)).toEqual({ column: 'boolean_value', bound: 0 });
  });

  it('routes numbers to number_value', () => {
    expect(columnForRhs(42)).toEqual({ column: 'number_value', bound: 42 });
    expect(columnForRhs(3.14)).toEqual({ column: 'number_value', bound: 3.14 });
  });

  it('routes ISO date strings to date_value', () => {
    expect(columnForRhs('2026-05-09')).toEqual({
      column: 'date_value',
      bound: '2026-05-09',
    });
  });

  it('routes other strings to text_value', () => {
    expect(columnForRhs('hello')).toEqual({ column: 'text_value', bound: 'hello' });
    // ISO-like but not a calendar date — still a string at this level;
    // the indexer's typing decides whether to write to date_value.
    expect(columnForRhs('05-09-2026')).toEqual({ column: 'text_value', bound: '05-09-2026' });
  });
});

describe('buildFilterFragment', () => {
  it('eq emits an EXISTS subquery on the typed column', () => {
    const f = buildFilterFragment({ kind: 'eq', key: 'priority', value: 1 });
    expect(f.sql).toContain('np.prop_key = ?');
    expect(f.sql).toContain('np.number_value = ?');
    expect(f.params).toEqual(['priority', 1]);
  });

  it('in with one type emits a single subquery', () => {
    const f = buildFilterFragment({
      kind: 'in',
      key: 'tag',
      values: ['urgent', 'work'],
    });
    expect(f.sql).toMatch(/text_value IN \(\?, \?\)/);
    expect(f.params).toEqual(['tag', 'urgent', 'work']);
  });

  it('in with mixed types emits OR-united subqueries per column', () => {
    const f = buildFilterFragment({
      kind: 'in',
      key: 'mixed',
      values: ['hello', 42],
    });
    expect(f.sql).toMatch(/text_value/);
    expect(f.sql).toMatch(/number_value/);
    expect(f.sql).toMatch(/ OR /);
  });

  it('in with empty values yields the `0 = 1` no-match guard', () => {
    expect(buildFilterFragment({ kind: 'in', key: 'k', values: [] })).toEqual({
      sql: '0 = 1',
      params: [],
    });
  });

  it('has uses EXISTS with only the prop_key existence check', () => {
    const f = buildFilterFragment({ kind: 'has', key: 'due' });
    expect(f.sql).toContain('EXISTS');
    // The SQL has equality for join+key, but no comparison against any
    // typed value column.
    expect(f.sql).not.toMatch(/(text|number|boolean|date|array)_value/);
    expect(f.params).toEqual(['due']);
  });

  it('lacks uses NOT EXISTS', () => {
    const f = buildFilterFragment({ kind: 'lacks', key: 'archived' });
    expect(f.sql).toContain('NOT EXISTS');
    expect(f.params).toEqual(['archived']);
  });

  it.each([
    ['lt', '<'],
    ['gt', '>'],
    ['lte', '<='],
    ['gte', '>='],
  ] as const)('%s emits the matching SQL operator', (kind, op) => {
    const f = buildFilterFragment({ kind, key: 'priority', value: 5 });
    expect(f.sql).toContain(`np.number_value ${op} ?`);
    expect(f.params).toEqual(['priority', 5]);
  });

  it('contains uses LIKE on text_value and array_value with escaping', () => {
    const f = buildFilterFragment({ kind: 'contains', key: 'body', value: 'a_b%c' });
    expect(f.sql).toContain('text_value LIKE');
    expect(f.sql).toContain('array_value LIKE');
    // LIKE wildcards in the user input are escaped so they're matched
    // literally rather than as wildcards themselves.
    expect(f.params[1]).toContain('a\\_b\\%c');
  });
});

describe('buildWhereFragments', () => {
  it('returns no fragments for an empty query', () => {
    const out = buildWhereFragments({});
    expect(out.fragments).toEqual([]);
    expect(out.params).toEqual([]);
  });

  it('emits a folder LIKE fragment with trailing slash', () => {
    const out = buildWhereFragments({ folder: 'projects' });
    expect(out.fragments[0]).toContain('n.path LIKE');
    expect(out.params[0]).toBe('projects/%');
  });

  it('strips trailing slashes from folder before building the LIKE', () => {
    const out = buildWhereFragments({ folder: 'projects/' });
    expect(out.params[0]).toBe('projects/%');
  });

  it('escapes LIKE-significant characters in the folder name', () => {
    const out = buildWhereFragments({ folder: 'a_b%c' });
    expect(out.params[0]).toBe('a\\_b\\%c/%');
  });

  it('combines folder and filters in declaration order', () => {
    const out = buildWhereFragments({
      folder: 'projects',
      filters: [{ kind: 'eq', key: 'status', value: 'open' }],
    });
    expect(out.fragments).toHaveLength(2);
    expect(out.fragments[0]).toContain('n.path LIKE');
    expect(out.fragments[1]).toContain('np.text_value');
  });
});

describe('buildSortClause', () => {
  it('always appends the n.path tiebreak even with no user sort', () => {
    const out = buildSortClause({});
    expect(out.joins).toEqual([]);
    expect(out.joinParams).toEqual([]);
    expect(out.orderBy).toEqual(['n.path ASC']);
  });

  it('emits one LEFT JOIN per sort key with aliased prop_key', () => {
    const out = buildSortClause({
      sort: [
        { key: 'priority', direction: 'desc' },
        { key: 'due', direction: 'asc' },
      ],
    });
    expect(out.joins).toHaveLength(2);
    expect(out.joins[0]).toContain('LEFT JOIN note_properties sp_0');
    expect(out.joins[1]).toContain('LEFT JOIN note_properties sp_1');
    expect(out.joinParams).toEqual(['priority', 'due']);
    expect(out.orderBy).toContain('n.path ASC');
  });

  it('encodes ASC/DESC direction into the order clause', () => {
    const out = buildSortClause({ sort: [{ key: 'k', direction: 'desc' }] });
    expect(out.orderBy[0]).toContain(' DESC');
  });
});

describe('clampQueryLimit', () => {
  it('returns the default when undefined', () => {
    expect(clampQueryLimit(undefined)).toBe(DEFAULT_QUERY_LIMIT);
  });

  it('returns the default for NaN', () => {
    // NaN slipping through Math.max would yield NaN, then SQLite either
    // errors on `LIMIT NaN` or silently coerces to 0.
    expect(clampQueryLimit(Number.NaN)).toBe(DEFAULT_QUERY_LIMIT);
  });

  it('returns the default for Infinity / -Infinity', () => {
    expect(clampQueryLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_QUERY_LIMIT);
    expect(clampQueryLimit(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_QUERY_LIMIT);
  });

  it('clamps below 1 to 1', () => {
    expect(clampQueryLimit(0)).toBe(1);
    expect(clampQueryLimit(-100)).toBe(1);
  });

  it('clamps above the cap to MAX_QUERY_LIMIT', () => {
    expect(clampQueryLimit(MAX_QUERY_LIMIT + 1)).toBe(MAX_QUERY_LIMIT);
    expect(clampQueryLimit(1_000_000)).toBe(MAX_QUERY_LIMIT);
  });

  it('passes through values inside the window', () => {
    expect(clampQueryLimit(250)).toBe(250);
    expect(clampQueryLimit(1)).toBe(1);
    expect(clampQueryLimit(MAX_QUERY_LIMIT)).toBe(MAX_QUERY_LIMIT);
  });
});

describe('buildWhereFragments — folder edge cases', () => {
  it('treats whitespace-only folder as "no folder filter"', () => {
    const out = buildWhereFragments({ folder: '   ' });
    expect(out.fragments).toEqual([]);
    expect(out.params).toEqual([]);
  });

  it('trims surrounding whitespace before building the LIKE', () => {
    const out = buildWhereFragments({ folder: '  projects  ' });
    expect(out.params[0]).toBe('projects/%');
  });

  it('treats an empty-string folder as "no folder filter"', () => {
    const out = buildWhereFragments({ folder: '' });
    expect(out.fragments).toEqual([]);
  });
});
