import type { FullGraph, GraphEdge, GraphNode } from '../../shared/ipc';
import type { GraphSettings } from './graph-settings';

export type DerivedGraphView = {
  graph: FullGraph;
  activeFilterCount: number;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function pathMatches(path: string, filters: readonly string[]): boolean {
  if (filters.length === 0) return true;
  const normalizedPath = normalize(path);
  return filters.some((filter) => {
    const normalizedFilter = normalize(filter).replace(/^\/+|\/+$/g, '');
    return (
      normalizedPath === normalizedFilter ||
      normalizedPath.startsWith(`${normalizedFilter}/`) ||
      normalizedPath.includes(normalizedFilter)
    );
  });
}

function nodeMatchesSearch(node: GraphNode, rawSearch: string): boolean {
  const search = normalize(rawSearch);
  if (search === '') return true;

  const tokens = search.split(/\s+/).filter(Boolean);
  return tokens.every((token) => {
    if (token.startsWith('type:')) {
      return normalize(node.type ?? '') === token.slice('type:'.length);
    }
    if (token.startsWith('path:') || token.startsWith('folder:')) {
      const value = token.slice(token.indexOf(':') + 1);
      return normalize(node.path).includes(value);
    }
    return normalize(node.title).includes(token) || normalize(node.path).includes(token);
  });
}

function nodeMatchesSettings(node: GraphNode, settings: GraphSettings): boolean {
  const { query } = settings;
  if (!nodeMatchesSearch(node, query.search)) return false;
  if (query.types.length > 0 && !query.types.includes(node.type ?? '')) return false;
  if (!pathMatches(node.path, query.folders)) return false;
  if (!pathMatches(node.path, query.paths)) return false;
  return true;
}

function edgeMatchesSettings(edge: GraphEdge, settings: GraphSettings): boolean {
  const kinds = settings.query.relationKinds;
  return kinds.length === 0 || kinds.includes(edge.kind);
}

function activeFilterCount(settings: GraphSettings): number {
  const { query } = settings;
  return [
    query.search.trim() !== '',
    query.tags.length > 0,
    query.folders.length > 0,
    query.paths.length > 0,
    query.types.length > 0,
    query.relationKinds.length > 0,
    !query.includeOrphans,
  ].filter(Boolean).length;
}

export function deriveGraphView(graph: FullGraph, settings: GraphSettings): DerivedGraphView {
  const matchedNodes = graph.nodes.filter((node) => nodeMatchesSettings(node, settings));
  let visibleIds = new Set(matchedNodes.map((node) => node.path));

  const matchedEdges = graph.edges.filter(
    (edge) =>
      edgeMatchesSettings(edge, settings) &&
      visibleIds.has(edge.source) &&
      visibleIds.has(edge.target),
  );

  let visibleEdges = matchedEdges;
  if (!settings.query.includeOrphans) {
    const connected = new Set<string>();
    for (const edge of matchedEdges) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
    visibleIds = connected;
    visibleEdges = matchedEdges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    );
  }

  const visibleNodes = matchedNodes.filter((node) => visibleIds.has(node.path));

  return {
    graph: {
      nodes: visibleNodes,
      edges: visibleEdges,
    },
    activeFilterCount: activeFilterCount(settings),
    hiddenNodeCount: graph.nodes.length - visibleNodes.length,
    hiddenEdgeCount: graph.edges.length - visibleEdges.length,
  };
}
