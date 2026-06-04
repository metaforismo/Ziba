import type { NotePath } from '@ziba/core';
import type { FullGraph, GraphEdge, GraphNode } from '../../shared/ipc';
import type { GraphSettings } from './graph-settings';
import { graphGroupQueryMatchesNode } from './graph-groups';

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
  return graphGroupQueryMatchesNode(node, rawSearch);
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
    query.minDegree > 0,
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

  if (settings.query.minDegree > 0) {
    const degree = new Map<string, number>();
    for (const edge of visibleEdges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    visibleIds = new Set(
      Array.from(visibleIds).filter((id) => (degree.get(id) ?? 0) >= settings.query.minDegree),
    );
    visibleEdges = visibleEdges.filter(
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

export function deriveLocalGraphView(
  graph: FullGraph,
  rootPath: NotePath,
  depth: number,
): DerivedGraphView {
  if (!graph.nodes.some((node) => node.path === rootPath)) {
    return {
      graph: { nodes: [], edges: [] },
      activeFilterCount: 1,
      hiddenNodeCount: graph.nodes.length,
      hiddenEdgeCount: graph.edges.length,
    };
  }

  const localDepth = Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0));
  const adjacency = new Map<NotePath, Set<NotePath>>();
  const ensure = (path: NotePath): Set<NotePath> => {
    let set = adjacency.get(path);
    if (set === undefined) {
      set = new Set();
      adjacency.set(path, set);
    }
    return set;
  };

  for (const edge of graph.edges) {
    ensure(edge.source).add(edge.target);
    ensure(edge.target).add(edge.source);
  }

  const visibleIds = new Set<NotePath>([rootPath]);
  let frontier = [rootPath];

  for (let level = 0; level < localDepth; level += 1) {
    const next: NotePath[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visibleIds.has(neighbor)) continue;
        visibleIds.add(neighbor);
        next.push(neighbor);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  const visibleNodes = graph.nodes.filter((node) => visibleIds.has(node.path));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );

  return {
    graph: {
      nodes: visibleNodes,
      edges: visibleEdges,
    },
    activeFilterCount: 1,
    hiddenNodeCount: graph.nodes.length - visibleNodes.length,
    hiddenEdgeCount: graph.edges.length - visibleEdges.length,
  };
}
