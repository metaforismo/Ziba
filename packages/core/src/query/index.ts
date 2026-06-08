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

export type DatabaseViewLayout = 'table' | 'board' | 'calendar' | 'gallery';

export type DatabaseViewDefinition = {
  id: string;
  name: string;
  layout: DatabaseViewLayout;
  query: DatabaseQuery;
  selectedType: string | null;
  columns: string[];
  createdAt: number;
  updatedAt: number;
};

export type DatabaseViewsFile = {
  version: 1;
  activeViewId: string | null;
  views: DatabaseViewDefinition[];
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
  /**
   * v1.0 Phase 5: `type:` slug from the note's frontmatter, or null
   * when the note is untyped. Drives the constellation graph's node
   * tinting and cluster grouping.
   */
  type: string | null;
  /**
   * v1.0 Phase 5: hex color from the type's cached schema, when both
   * the type slug and a matching `object_types` row with a non-null
   * `color` exist. Null otherwise (no schema, or schema with no color
   * declared).
   *
   * NOTE (graph monochrome redesign): the renderer no longer auto-tints
   * nodes from this schema color. It is kept on the wire because the
   * type-filter chips still surface it; node tinting now comes ONLY from
   * user-defined graph groups.
   */
  color: string | null;
  /**
   * Graph monochrome redesign: marks a "phantom" node — a wikilink
   * target (`[[Concept]]`) that has no backing note file. Rendered gray,
   * smaller and dimmer (Obsidian's unresolved nodes). Absent/false for
   * every real note. The `path` of an unresolved node is the synthetic
   * `UNRESOLVED_NODE_PREFIX + lower(title)` id, never a real file path.
   */
  unresolved?: boolean;
};

/**
 * Synthetic id prefix for unresolved (phantom) graph nodes. Chosen so it
 * can never collide with a real vault-relative path: real `NotePath`s are
 * POSIX paths ending in `.md`, and the `:` after the prefix is not a path
 * separator we emit. Mirrors the MiniGraph `broken:` convention but is
 * distinct so the two id-spaces never overlap if ever merged.
 */
export const UNRESOLVED_NODE_PREFIX = 'unresolved:';

/**
 * Distinct sentinel `kind` for soft references (unlinked mentions): a
 * note whose body contains another note's title verbatim but WITHOUT an
 * explicit `[[wikilink]]`. We use a reserved, non-empty marker so the
 * UI can style these like Obsidian's unresolved/soft edges (dashed +
 * dimmed) and dedupe them against explicit links. The `:` prefix can
 * never collide with a user-authored `relations:<kind>` key because
 * frontmatter relation kinds are bare identifiers.
 */
export const MENTION_EDGE_KIND = ':mention';

export type GraphEdge = {
  source: NotePath;
  target: NotePath;
  targetTitle: string;
  /**
   * v1.0 Phase 5: relation kind. The empty string `''` is the
   * sentinel for generic body wikilinks; non-empty values match the
   * frontmatter `relations:<kind>` key. The reserved `MENTION_EDGE_KIND`
   * marks a soft reference (unlinked textual mention).
   */
  kind: string;
};

export type FullGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/**
 * A candidate soft-reference edge (source mentions target's title in
 * its body, no explicit wikilink). Kept as a separate shape from
 * `GraphEdge` so the merge step in `mergeMentionEdges` is a pure,
 * unit-testable function with no DB dependency.
 */
export type MentionEdge = {
  source: NotePath;
  target: NotePath;
  targetTitle: string;
};

/**
 * Merge soft-reference (mention) edges into a base set of explicit
 * graph edges, applying the dedupe/cleanup rules:
 *
 *   - An explicit edge (wikilink or typed relation) ALWAYS wins over a
 *     mention for the same `source → target` pair, regardless of kind.
 *   - Self-mentions (`source === target`) are dropped.
 *   - Duplicate mentions for the same pair collapse to one.
 *   - Mentions whose endpoints aren't both real nodes are dropped.
 *
 * Pure function: the adapter resolves candidate mentions, this decides
 * which survive. Returns a NEW array (explicit edges first, then the
 * surviving mention edges) — order is stable for deterministic layout.
 */
export function mergeMentionEdges(
  explicitEdges: readonly GraphEdge[],
  mentionCandidates: readonly MentionEdge[],
  knownNodePaths: ReadonlySet<NotePath>,
): GraphEdge[] {
  const explicitPairs = new Set<string>();
  for (const edge of explicitEdges) {
    explicitPairs.add(`${edge.source} ${edge.target}`);
  }

  const seenMentionPairs = new Set<string>();
  const merged: GraphEdge[] = [...explicitEdges];

  for (const candidate of mentionCandidates) {
    if (candidate.source === candidate.target) continue;
    if (!knownNodePaths.has(candidate.source)) continue;
    if (!knownNodePaths.has(candidate.target)) continue;
    const key = `${candidate.source} ${candidate.target}`;
    // Explicit link wins: never emit a mention for a pair that already
    // has any explicit edge between the same endpoints.
    if (explicitPairs.has(key)) continue;
    if (seenMentionPairs.has(key)) continue;
    seenMentionPairs.add(key);
    merged.push({
      source: candidate.source,
      target: candidate.target,
      targetTitle: candidate.targetTitle,
      kind: MENTION_EDGE_KIND,
    });
  }

  return merged;
}

/**
 * A broken outgoing wikilink: `source` links to `targetTitle` via
 * `[[targetTitle]]` but no note resolves to that title (its row in the
 * `relations` table has `target_path IS NULL`). The adapter surfaces
 * these so the global graph can render the missing target as an
 * Obsidian-style gray "unresolved" phantom node.
 */
export type BrokenLink = {
  source: NotePath;
  targetTitle: string;
};

/**
 * Stable synthetic id for an unresolved node, derived from its title.
 * Case-insensitive (Obsidian title resolution is case-insensitive), so
 * `[[Concept]]` and `[[concept]]` from different notes collapse onto ONE
 * phantom node. Whitespace is trimmed; the original casing is preserved
 * for display in the returned node's `title`.
 */
export function unresolvedNodeId(title: string): NotePath {
  return `${UNRESOLVED_NODE_PREFIX}${title.trim().toLowerCase()}`;
}

/**
 * Fold broken wikilinks into a base graph as unresolved phantom nodes +
 * their incoming edges. Pure & unit-tested so the SQLite adapter stays a
 * thin query.
 *
 * Rules:
 *   - A broken link whose `targetTitle` already resolves to a real node
 *     (case-insensitive title match against an existing node) is DROPPED:
 *     the target exists, so it isn't a phantom. (Defensive — the adapter
 *     only passes genuinely unresolved targets, but a title can match a
 *     real note via casing differences the SQL `target_path` join missed.)
 *   - Phantom nodes dedupe by synthetic id (case-insensitive title), so
 *     many `[[Concept]]` links across notes share one gray node.
 *   - One edge per (source → phantom) pair; duplicate links collapse.
 *   - Links whose `source` isn't a known real node are dropped (dangling).
 *
 * Returns a NEW graph: original nodes/edges first (stable order), then the
 * phantom nodes, then the phantom edges. Edge `kind` is `''` (generic
 * wikilink) so the renderer styles the connector like any other link.
 */
export function mergeUnresolvedNodes(
  graph: FullGraph,
  brokenLinks: readonly BrokenLink[],
): FullGraph {
  const knownPaths = new Set<NotePath>();
  const knownTitlesLower = new Set<string>();
  for (const node of graph.nodes) {
    knownPaths.add(node.path);
    knownTitlesLower.add(node.title.trim().toLowerCase());
  }

  const phantomNodes = new Map<NotePath, GraphNode>();
  const phantomEdges: GraphEdge[] = [];
  const seenEdgePairs = new Set<string>();

  for (const link of brokenLinks) {
    const title = link.targetTitle.trim();
    if (title === '') continue;
    // Source must be a real node, else the edge dangles.
    if (!knownPaths.has(link.source)) continue;
    // Target resolves to a real note after all → not a phantom.
    if (knownTitlesLower.has(title.toLowerCase())) continue;

    const id = unresolvedNodeId(title);
    if (!phantomNodes.has(id)) {
      phantomNodes.set(id, {
        path: id,
        title,
        type: null,
        color: null,
        unresolved: true,
      });
    }

    const pairKey = `${link.source} ${id}`;
    if (seenEdgePairs.has(pairKey)) continue;
    seenEdgePairs.add(pairKey);
    phantomEdges.push({ source: link.source, target: id, targetTitle: title, kind: '' });
  }

  return {
    nodes: [...graph.nodes, ...phantomNodes.values()],
    edges: [...graph.edges, ...phantomEdges],
  };
}
