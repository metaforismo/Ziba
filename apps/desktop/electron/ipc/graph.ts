// Full graph IPC handler (v0.3 Wave 1; soft references added in the UX
// overhaul).
//
// Returns every note + every RESOLVED outgoing wikilink/relation, PLUS
// soft-reference (unlinked mention) edges so the global graph can render
// them dashed/dimmed like Obsidian. Wave 2's global graph view reads this
// once on mount and re-fetches when the index reports a rebuild.

import { mergeMentionEdges, type FullGraph } from '@ziba/core';
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

  // Skip the (potentially expensive) mention pass on large vaults.
  if (graph.nodes.length > MENTION_NODE_CEILING) {
    return graph;
  }

  const candidates = await store.getMentionEdges(MENTION_PER_TARGET_LIMIT, MENTION_TOTAL_LIMIT);
  const knownPaths = new Set(graph.nodes.map((node) => node.path));
  // Dedupe: explicit links win over mentions for the same pair; drop
  // self-mentions and dangling endpoints. Pure, unit-tested in core.
  const edges = mergeMentionEdges(graph.edges, candidates, knownPaths);

  return { nodes: graph.nodes, edges };
}
