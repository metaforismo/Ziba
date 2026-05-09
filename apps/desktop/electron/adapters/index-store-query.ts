// SQL fragment builders for the v0.3+ database-query API.
//
// Extracted from `index-store.sqlite.ts` so the SQLite adapter can stay
// focused on lifecycle (open/close, prepared statements, transactions)
// and the query-shaping logic — which is pure and benefits from being
// unit-testable in isolation — lives in one self-contained module.
//
// Everything here operates on the SQL string + bound-parameter array
// shape; nothing in this file talks to `better-sqlite3` directly. That
// keeps the contract obvious: the adapter calls these helpers, gets
// back a fragment, and stitches them into a prepared statement.
//
// Conventions:
//   - SQL fragments reference `notes n` (the alias used by the adapter).
//   - Parameter arrays are positional; callers concatenate them in the
//     same order they concatenate the SQL fragments.
//   - Filter / sort logic mirrors `DatabaseQuery` in `@ziba/core`;
//     keep the two in lock-step when adding new filter kinds.

import type { DatabaseQuery, ScalarFilter } from '@ziba/core';

/** Default LIMIT applied when the caller didn't pass one. */
export const DEFAULT_QUERY_LIMIT = 1000;

/** Hard cap on LIMIT — clamped before reaching SQLite. */
export const MAX_QUERY_LIMIT = 5000;

/**
 * A single WHERE-fragment. Three variants make the semantics explicit:
 *
 *   - `predicate` — a real SQL fragment with bound params. The caller
 *     concatenates `sql` and feeds `params` in order.
 *   - `always-false` — the filter as written cannot match any row
 *     (today: `in [ ]`). The caller should short-circuit and skip the
 *     SQLite round-trip entirely.
 *   - `always-true` — the filter has no effect (currently unused, but
 *     reserved so a future filter-kind that degenerates to "match
 *     anything" doesn't have to invent an `1 = 1` literal).
 *
 * Modelling them as a discriminated union prevents the previous
 * collision where `{ sql: '0 = 1' }` rode the same shape as a real
 * predicate — and it makes future filter-kinds explicit about which
 * degenerate case they fall into.
 */
export type Fragment =
  | { kind: 'predicate'; sql: string; params: ReadonlyArray<string | number> }
  | { kind: 'always-false' }
  | { kind: 'always-true' };

export type SortClause = {
  /** LEFT JOIN snippets used to expose sort-target columns on `notes n`. */
  joins: ReadonlyArray<string>;
  /** Parameters bound by the joins (one per sort key — the property key). */
  joinParams: ReadonlyArray<string | number>;
  /** Ordered list of `<expr> ASC|DESC` clauses, including the path tiebreak. */
  orderBy: ReadonlyArray<string>;
};

/**
 * Pick the typed column / bound value to compare against for a given
 * RHS. The indexer writes a property's value to exactly one of
 * `text_value` / `number_value` / `boolean_value` / `date_value`, so
 * we have to send the comparison to the matching column.
 *
 * Heuristic for strings: only the exact 10-character ISO calendar form
 * `YYYY-MM-DD` routes to `date_value` — that's what the indexer's
 * `detectProperty` accepts. Everything else (free text, datetimes
 * with a `T` component like `2026-05-09T10:00`, locale strings) falls
 * back to `text_value`. If a datetime needs to compare against a
 * `date_value`-stored property, the caller must trim it to the date
 * portion before passing it in — otherwise the LHS and RHS land in
 * different columns and the comparison silently returns no rows.
 */
export function columnForRhs(rhs: number | string | boolean): {
  column: 'number_value' | 'text_value' | 'boolean_value' | 'date_value';
  bound: number | string | 0 | 1;
} {
  if (typeof rhs === 'boolean') {
    return { column: 'boolean_value', bound: rhs ? 1 : 0 };
  }
  if (typeof rhs === 'number') {
    return { column: 'number_value', bound: rhs };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rhs)) {
    return { column: 'date_value', bound: rhs };
  }
  return { column: 'text_value', bound: rhs };
}

/**
 * Translate a single filter into an `EXISTS` / `NOT EXISTS` predicate
 * referencing `notes n`. Caller AND's all returned fragments together.
 *
 * Filter kinds:
 *   - `eq` / `lt` / `gt` / `lte` / `gte`: compare the matching typed
 *     column to a single bound RHS.
 *   - `in`: union per-column subqueries when the RHS array mixes types
 *     (rare, but legal — e.g. `["a", 1]`).
 *   - `has` / `lacks`: existence checks on `prop_key`.
 *   - `contains`: substring LIKE on `text_value`/`array_value` (the
 *     latter matches the JSON-encoded `"value"` token, sufficient for
 *     v0.3 array-element membership without a separate index).
 */
export function buildFilterFragment(f: ScalarFilter): Fragment {
  switch (f.kind) {
    case 'eq': {
      const { column, bound } = columnForRhs(f.value);
      return {
        kind: 'predicate',
        sql: `EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ? AND np.${column} = ?)`,
        params: [f.key, bound],
      };
    }
    case 'in': {
      if (f.values.length === 0) {
        // `in [ ]` matches nothing — surface this as the explicit
        // always-false variant so the adapter can short-circuit and
        // skip the SQLite round-trip entirely.
        return { kind: 'always-false' };
      }
      const byColumn = new Map<string, Array<number | string | 0 | 1>>();
      for (const v of f.values) {
        const { column, bound } = columnForRhs(v);
        const arr = byColumn.get(column) ?? [];
        arr.push(bound);
        byColumn.set(column, arr);
      }
      const subs: string[] = [];
      const params: Array<string | number> = [];
      for (const [column, vals] of byColumn) {
        const placeholders = vals.map(() => '?').join(', ');
        subs.push(
          `EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ? AND np.${column} IN (${placeholders}))`,
        );
        params.push(f.key, ...vals);
      }
      return { kind: 'predicate', sql: `(${subs.join(' OR ')})`, params };
    }
    case 'has':
      return {
        kind: 'predicate',
        sql: `EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ?)`,
        params: [f.key],
      };
    case 'lacks':
      return {
        kind: 'predicate',
        sql: `NOT EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ?)`,
        params: [f.key],
      };
    case 'lt':
    case 'gt':
    case 'lte':
    case 'gte': {
      const op = { lt: '<', gt: '>', lte: '<=', gte: '>=' }[f.kind];
      const { column, bound } = columnForRhs(f.value);
      return {
        kind: 'predicate',
        sql: `EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ? AND np.${column} ${op} ?)`,
        params: [f.key, bound],
      };
    }
    case 'contains': {
      // Substring match over text/url, plus JSON `"value"` token match
      // on string-array. The token form is approximate but good enough
      // for v0.3 — `array_value` is JSON-encoded so an exact element
      // match shows up as `"value"` somewhere in the string.
      const like = `%${f.value.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      const arrayLike = `%${JSON.stringify(f.value).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      return {
        kind: 'predicate',
        sql: `EXISTS (SELECT 1 FROM note_properties np WHERE np.source_path = n.path AND np.prop_key = ? AND (np.text_value LIKE ? ESCAPE '\\' OR np.array_value LIKE ? ESCAPE '\\'))`,
        params: [f.key, like, arrayLike],
      };
    }
  }
}

/**
 * Result of compiling all top-level WHERE conjuncts. The adapter
 * branches on `kind`:
 *   - `predicates` — concatenate `fragments` with ` AND ` and prepend
 *     `WHERE`. `params` flow into the prepared statement in order.
 *     An empty `fragments` array means "no constraint" → no WHERE
 *     clause at all.
 *   - `always-false` — at least one filter is unsatisfiable
 *     (e.g. `in [ ]`). The whole query matches nothing; the adapter
 *     should return an empty result without touching SQLite.
 */
export type WhereFragments =
  | {
      kind: 'predicates';
      fragments: ReadonlyArray<string>;
      params: ReadonlyArray<string | number>;
    }
  | { kind: 'always-false' };

/**
 * Build the WHERE-fragment list (each entry is a top-level conjunct)
 * from a query's `folder` + `filters` fields. AND-of-fragments
 * semantics: a single `always-false` short-circuits the whole query.
 */
export function buildWhereFragments(query: DatabaseQuery): WhereFragments {
  const fragments: string[] = [];
  const params: Array<string | number> = [];

  if (query.folder !== undefined) {
    // Whitespace-only / empty folder = "no folder filter" (vault root).
    // Trim leading/trailing whitespace before checking — otherwise a
    // value like `"   "` falls through and produces an unmatchable LIKE
    // pattern, silently returning zero rows when the user meant
    // "everything".
    const folderClean = query.folder.trim().replace(/\/+$/, '');
    if (folderClean.length > 0) {
      // Match notes whose path begins with `<folder>/`. Escape LIKE
      // metacharacters so a literal underscore in a folder name doesn't
      // act as a wildcard.
      const escaped = folderClean.replace(/[\\%_]/g, (c) => '\\' + c);
      fragments.push(`n.path LIKE ? ESCAPE '\\'`);
      params.push(escaped + '/%');
    }
  }

  if (query.filters !== undefined && query.filters.length > 0) {
    for (const f of query.filters) {
      const frag = buildFilterFragment(f);
      switch (frag.kind) {
        case 'always-false':
          // One unsatisfiable conjunct collapses the whole AND.
          return { kind: 'always-false' };
        case 'always-true':
          // No-op conjunct — drop it so the WHERE stays minimal.
          continue;
        case 'predicate':
          fragments.push(frag.sql);
          params.push(...frag.params);
          continue;
      }
    }
  }

  return { kind: 'predicates', fragments, params };
}

/**
 * Build the LEFT JOINs + ORDER BY clauses for `query.sort`. Always
 * appends a deterministic tiebreak on `n.path ASC` so result ordering
 * is stable across runs even when the user-specified sort is empty
 * or has ties.
 */
export function buildSortClause(query: DatabaseQuery): SortClause {
  const joins: string[] = [];
  const joinParams: Array<string | number> = [];
  const orderBy: string[] = [];

  if (query.sort !== undefined && query.sort.length > 0) {
    query.sort.forEach((s, idx) => {
      const alias = `sp_${idx}`;
      joins.push(
        `LEFT JOIN note_properties ${alias} ON ${alias}.source_path = n.path AND ${alias}.prop_key = ?`,
      );
      joinParams.push(s.key);
      const dir = s.direction === 'desc' ? 'DESC' : 'ASC';
      // COALESCE picks the populated typed column. Mixed-type sort is
      // best-effort: text → number → date precedence keeps the result
      // stable but the ordering across types isn't meaningful.
      orderBy.push(
        `COALESCE(${alias}.text_value, CAST(${alias}.number_value AS TEXT), ${alias}.date_value) ${dir}`,
      );
    });
  }
  orderBy.push('n.path ASC');

  return { joins, joinParams, orderBy };
}

/**
 * Clamp a caller-supplied `limit` to the supported window. `undefined`,
 * `NaN`, `Infinity`, and any non-finite value resolve to
 * `DEFAULT_QUERY_LIMIT`. Out-of-range finite values are pulled back
 * into `[1, MAX_QUERY_LIMIT]` rather than rejected, mirroring the IPC
 * layer's defensive validation.
 *
 * Why the `Number.isFinite` guard: a `NaN` slipping through `Math.max`
 * yields `NaN`, which SQLite either errors on or silently coerces to 0
 * — neither outcome is what the caller asked for, but both look like
 * "the query mysteriously returned nothing" from the UI side.
 */
export function clampQueryLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_QUERY_LIMIT;
  }
  return Math.max(1, Math.min(requested, MAX_QUERY_LIMIT));
}
