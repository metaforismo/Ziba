// Full graph IPC handler (v0.3 Wave 1; soft references added in the UX
// overhaul).
//
// Returns every note + every RESOLVED outgoing wikilink/relation, PLUS
// soft-reference (unlinked mention) edges so the global graph can render
// them dashed/dimmed like Obsidian. Wave 2's global graph view reads this
// once on mount and re-fetches when the index reports a rebuild.

import { mergeMentionEdges, mergeUnresolvedNodes, type FullGraph } from '@ziba/core';
import { requireIndexStore } from '../state.js';

// Per-target FTS cap — mirrors the per-note MENTION_LIMIT used by
// `getReferences` so the two views agree on how many mentions a single
// note can attract.
const MENTION_PER_TARGET_LIMIT = 80;

// Global cap across the whole vault. Mentions are worst-case quadratic
// (every note could mention every other), so we bound the total work and
// the number of edges shipped to the renderer.
const MENTION_TOTAL_LIMIT = 4000;

// Above this node count we skip mention computation entirely: the FTS
// pass is O(nodes) queries and the renderer already warns about layout
// cost past ~1000 nodes. Soft references are a "nice to have" overlay,
// not worth degrading huge-vault load times.
const MENTION_NODE_CEILING = 1500;

export async function getFullGraph(): Promise<FullGraph> {
  const store = requireIndexStore();
  const graph = await store.getFullGraph();

  // Skip the (potentially expensive) augmentation passes on large vaults:
  // both the FTS mention scan and the extra phantom nodes/edges are
  // "nice to have" overlays not worth degrading huge-vault load times.
  // The renderer already warns past ~1000 nodes (LARGE_GRAPH_WARN).
  if (graph.nodes.length > MENTION_NODE_CEILING) {
    return graph;
  }

  // Phantom nodes first: broken `[[wikilinks]]` (relations with a null
  // target_path) become Obsidian-style gray "unresolved" nodes. Reuses
  // the SAME relation/target-resolution state as the per-note broken-link
  // detection. Pure merge synthesises the nodes + their incoming edges.
  const brokenLinks = await store.getBrokenLinks();
  const withUnresolved = mergeUnresolvedNodes(graph, brokenLinks);

  const candidates = await store.getMentionEdges(MENTION_PER_TARGET_LIMIT, MENTION_TOTAL_LIMIT);
  // Mentions only connect real notes — `knownPaths` is the set of REAL
  // node paths (phantom ids are excluded), so a mention never lands on an
  // unresolved node. Dedupe: explicit links win over mentions for a pair;
  // drop self-mentions and dangling endpoints. Pure, unit-tested in core.
  const knownPaths = new Set(graph.nodes.map((node) => node.path));
  const edges = mergeMentionEdges(withUnresolved.edges, candidates, knownPaths);

  return { nodes: withUnresolved.nodes, edges };
}
