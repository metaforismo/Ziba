// Query types + a tiny "build me a typed property" helper used by the
// indexer. The query AST itself is consumed by the SQLite adapter; this
// module owns only the surface shapes and the (pure) detection rules.
//
// Detection rules MUST stay in sync with
// `apps/desktop/src/components/PropertyEditor/types.ts::detectPropertyType`.
// We duplicate them deliberately so the indexer in core has no UI dep.

import type { NotePath } from '../types/note.js';

export type PropertyType = 'text' | 'number' | 'boolean' | 'date' | 'url' | 'string-array';

/**
 * Permissive runtime shape of a frontmatter value. The detector narrows
 * this to one of the typed branches in `DetectedProperty`.
 */
export type PropertyValue = string | number | boolean | string[] | null;

/**
 * Detected frontmatter property type with its narrowed value. Same shape as
 * the renderer's PropertyEditor types but lives in core so the indexer and
 * the UI agree on detection rules.
 */
export type DetectedProperty =
  | { key: string; type: 'text'; value: string }
  | { key: string; type: 'number'; value: number }
  | { key: string; type: 'boolean'; value: boolean }
  | { key: string; type: 'date'; value: string } // ISO YYYY-MM-DD
  | { key: string; type: 'url'; value: string }
  | { key: string; type: 'string-array'; value: string[] };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Detect a frontmatter entry's type. Pure function — same rules as
 * PropertyEditor's `detectPropertyType` but specialised for the indexer:
 * we DROP `unsupported` / `multi-select`-of-mixed values rather than
 * persist them, since they aren't queryable.
 *
 * Order matters (first match wins):
 *   1. boolean
 *   2. finite number
 *   3. Date instance → ISO YYYY-MM-DD string, type 'date'
 *   4. string YYYY-MM-DD → 'date'
 *   5. string ^https?:// → 'url'
 *   6. any other string → 'text'
 *   7. array of strings → 'string-array'
 *   8. anything else → null (unsupported, dropped silently)
 */
export function detectProperty(key: string, value: unknown): DetectedProperty | null {
  if (typeof value === 'boolean') {
    return { key, type: 'boolean', value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { key, type: 'number', value };
  }
  if (value instanceof Date) {
    // Convert Date instances to ISO YYYY-MM-DD. gray-matter sometimes
    // surfaces Date objects when frontmatter contains a bare YAML date.
    if (Number.isNaN(value.getTime())) return null;
    const iso = value.toISOString().slice(0, 10);
    return { key, type: 'date', value: iso };
  }
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      return { key, type: 'date', value };
    }
    if (HTTP_URL_RE.test(value)) {
      return { key, type: 'url', value };
    }
    return { key, type: 'text', value };
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) {
      return { key, type: 'string-array', value: value as string[] };
    }
    return null;
  }
  return null;
}

/**
 * Walk a frontmatter object and emit a DetectedProperty for each entry that
 * fits one of the supported types. Unsupported values (deep objects,
 * non-string arrays, NaN, undefined) are dropped silently. Order of the
 * input object's enumerable keys is preserved.
 */
export function extractProperties(frontmatter: Record<string, unknown>): DetectedProperty[] {
  const out: DetectedProperty[] = [];
  for (const key of Object.keys(frontmatter)) {
    const detected = detectProperty(key, frontmatter[key]);
    if (detected !== null) out.push(detected);
  }
  return out;
}

// ---- Query AST ----------------------------------------------------------

/**
 * Single AND'd predicate over a property key. The adapter translates each
 * variant to an EXISTS / NOT EXISTS subquery against `note_properties`.
 *
 *   - `eq`       value strictly equals
 *   - `in`       value is in a small set
 *   - `has`      property is present (any non-null value)
 *   - `lacks`    property is absent OR its row is null/missing
 *   - `lt|gt|lte|gte` numeric or date comparison
 *   - `contains` substring (text) OR array-includes (string-array)
 */
export type ScalarFilter =
  | { kind: 'eq'; key: string; value: string | number | boolean }
  | { kind: 'in'; key: string; values: Array<string | number | boolean> }
  | { kind: 'has'; key: string }
  | { kind: 'lacks'; key: string }
  | { kind: 'lt'; key: string; value: number | string }
  | { kind: 'gt'; key: string; value: number | string }
  | { kind: 'lte'; key: string; value: number | string }
  | { kind: 'gte'; key: string; value: number | string }
  | { kind: 'contains'; key: string; value: string };

export type DatabaseQuery = {
  /** Limit to notes whose path begins with this folder (forward slashes). */
  folder?: string;
  /** AND'd filters. Empty / missing = no filtering. */
  filters?: ScalarFilter[];
  /** Stable multi-key sort. First entry is primary. */
  sort?: Array<{ key: string; direction: 'asc' | 'desc' }>;
  /** Optional grouping by a single property key, used for table view headers. */
  groupBy?: string;
  /** Hard cap on returned rows. Default in adapter: 1000. */
  limit?: number;
};

/**
 * Materialised row returned by the query API. `properties` is keyed by
 * property name and contains the typed `DetectedProperty` for that key —
 * this lets the table view render cells without re-detecting type.
 */
export type DatabaseRow = {
  path: NotePath;
  title: string;
  mtimeMs: number;
  properties: Record<string, DetectedProperty>;
};

export type DatabaseGroup = {
  /** Group key value. `null` represents notes that lack the grouping key. */
  value: string | number | boolean | null;
  count: number;
};

export type DatabaseResult = {
  rows: DatabaseRow[];
  /**
   * When `groupBy` is set: counts per group key (for the table view's
   * group headers). Empty otherwise.
   */
  groups: DatabaseGroup[];
  /** Total rows matching the filter (possibly > rows.length when limit hit). */
  totalCount: number;
};

// ---- Full graph (powers the v0.3 Wave 2 global graph) -------------------

export type GraphNode = {
  path: NotePath;
  title: string;
};

export type GraphEdge = {
  source: NotePath;
  target: NotePath;
  targetTitle: string;
};

export type FullGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
