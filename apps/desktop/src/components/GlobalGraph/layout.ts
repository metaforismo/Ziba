// Force-directed layout for the full-vault graph.
//
// The mini graph keeps its tiny hand-rolled simulator, but the global
// graph deserves Barnes-Hut repulsion and predictable controls. We use
// `d3-force` behind this small API so the rest of the graph stays unaware
// of the engine swap.

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import {
  initializeOnCircle as miniInitializeOnCircle,
  type LayoutEdge,
  type LayoutNode,
} from '../MiniGraph/layout';
import type { GraphForceSettings } from '../../lib/graph-settings';

export type { LayoutEdge, LayoutNode };

export type GlobalLayoutOptions = {
  /** Logical canvas width the simulation runs on. */
  width: number;
  /** Logical canvas height the simulation runs on. */
  height: number;
  /**
   * Number of integrator ticks. Larger graphs need more passes to settle
   * since each tick can only move a node by ~its current velocity. We
   * derive a good default in `runGlobalLayout` based on `nodes.length`.
   */
  iterations?: number;
  /** Optional user-facing force controls from the graph settings panel. */
  forces?: GraphForceSettings;
};

const GLOBAL_DEFAULTS = {
  chargeStrength: -620,
  linkStrength: 0.12,
  linkDistance: 132,
  collideRadius: 25.28,
  centerStrength: 0.04,
} as const;

export function resolveGlobalForces(forces: GraphForceSettings | undefined): {
  chargeStrength: number;
  linkStrength: number;
  linkDistance: number;
  collideRadius: number;
  centerStrength: number;
} {
  if (forces === undefined) {
    return GLOBAL_DEFAULTS;
  }

  return {
    chargeStrength: -Math.max(0, forces.repel),
    linkStrength: Math.max(0, forces.link),
    linkDistance: Math.max(10, forces.linkDistance),
    collideRadius: 8 + Math.max(0, forces.nodeDistance) * 0.36,
    centerStrength: Math.max(0, forces.center),
  };
}

/**
 * Heuristic iteration count.
 *
 * Empirically: small graphs settle in well under 200 ticks, while a
 * 500-node graph wants ~600 to look stable; the cost of those extra
 * ticks is mostly the O(n²) repulsion, which we pay once on data load.
 * We cap at 800 to keep the worst case under ~3s on the dev box.
 */
function defaultIterations(nodeCount: number): number {
  if (nodeCount <= 30) return 200;
  if (nodeCount <= 100) return 400;
  if (nodeCount <= 300) return 600;
  return 800;
}

/**
 * Initialise positions on a single ring around the canvas centre.
 *
 * Re-uses the mini-graph's circle initialiser by tagging every node as
 * `'outbound'` so none of them are pinned. Starting from a circle
 * (rather than random) gives a reproducible settle and avoids the
 * "explosion" you sometimes get when two random points start on top of
 * each other.
 */
export function initializePositions(
  ids: string[],
  width: number,
  height: number,
  typeById?: ReadonlyMap<string, string | null>,
): LayoutNode[] {
  // Radius scales with sqrt(n) so a denser graph gets a wider initial
  // ring — keeps the average per-node distance roughly constant at t=0
  // and the simulator doesn't have to spend its first dozen ticks just
  // pushing things apart.
  const radius = Math.min(width, height) / 2 - 24;
  const seedRadius = Math.max(60, Math.min(radius, 30 + Math.sqrt(ids.length) * 8));
  return miniInitializeOnCircle(
    ids.map((id) => {
      const t = typeById?.get(id);
      const base: { id: string; kind: 'outbound' } = { id, kind: 'outbound' };
      // Only attach nodeType when it's a non-empty string. `exactOptionalPropertyTypes`
      // forbids `nodeType: undefined`, so we conditionally spread.
      return t !== undefined && t !== null && t !== '' ? { ...base, nodeType: t } : base;
    }),
    width,
    height,
    seedRadius,
  );
}

/**
 * Run a force simulation on `nodes` using `edges`. Mutates and returns
 * the input array.
 *
 * The caller is expected to pass an already-initialised set of nodes
 * (see `initializePositions`). We do not re-shuffle on each call so the
 * layout is stable across re-renders — only its data dependencies (the
 * full set of nodes/edges) trigger a fresh settle.
 */
export function runGlobalLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: GlobalLayoutOptions,
): LayoutNode[] {
  if (nodes.length === 0) return nodes;
  const iterations = opts.iterations ?? defaultIterations(nodes.length);
  const forces = resolveGlobalForces(opts.forces);
  const ids = new Set(nodes.map((node) => node.id));
  const simNodes: D3LayoutNode[] = nodes.map((node) => {
    const simNode: D3LayoutNode = {
      id: node.id,
      x: node.x,
      y: node.y,
      vx: node.vx,
      vy: node.vy,
    };
    if (node.nodeType !== undefined && node.nodeType !== null && node.nodeType !== '') {
      simNode.nodeType = node.nodeType;
    }
    return simNode;
  });
  const simLinks: D3LayoutLink[] = edges.flatMap((edge) =>
    ids.has(edge.source) && ids.has(edge.target)
      ? [{ source: edge.source, target: edge.target }]
      : [],
  );

  forceSimulation<D3LayoutNode>(simNodes)
    .force(
      'charge',
      forceManyBody<D3LayoutNode>()
        .strength(forces.chargeStrength)
        .distanceMin(8)
        .distanceMax(Math.max(opts.width, opts.height)),
    )
    .force(
      'link',
      forceLink<D3LayoutNode, D3LayoutLink>(simLinks)
        .id((node) => node.id)
        .distance(forces.linkDistance)
        .strength(forces.linkStrength),
    )
    .force(
      'collide',
      forceCollide<D3LayoutNode>()
        .radius((node) => {
          const typeBias = node.nodeType === undefined || node.nodeType === '' ? 0 : 2;
          return forces.collideRadius + typeBias;
        })
        .strength(0.64)
        .iterations(2),
    )
    .force('x', forceX<D3LayoutNode>(opts.width / 2).strength(forces.centerStrength))
    .force('y', forceY<D3LayoutNode>(opts.height / 2).strength(forces.centerStrength))
    .force('center', forceCenter<D3LayoutNode>(opts.width / 2, opts.height / 2))
    .stop()
    .tick(iterations);

  const padding = 28;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const simNode = simNodes[i];
    if (node === undefined || simNode === undefined) continue;
    node.x = clampFinite(simNode.x, padding, opts.width - padding, opts.width / 2);
    node.y = clampFinite(simNode.y, padding, opts.height - padding, opts.height / 2);
    node.vx = Number.isFinite(simNode.vx) ? (simNode.vx ?? 0) : 0;
    node.vy = Number.isFinite(simNode.vy) ? (simNode.vy ?? 0) : 0;
  }

  return nodes;
}

type D3LayoutNode = SimulationNodeDatum & {
  id: string;
  nodeType?: string | null;
};

type D3LayoutLink = SimulationLinkDatum<D3LayoutNode> & {
  source: string | D3LayoutNode;
  target: string | D3LayoutNode;
};

function clampFinite(n: number | undefined, lo: number, hi: number, fallback: number): number {
  if (n === undefined || !Number.isFinite(n)) return fallback;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/**
 * Compute the bounding box of laid-out nodes. Used to fit-to-screen on
 * initial render — we translate+scale the canvas so all nodes are
 * visible regardless of where the simulation parked them inside its
 * logical viewBox.
 *
 * Accepts any node-shaped value with `x`/`y` so callers can pass either
 * raw `LayoutNode`s (post-simulation) or display-time `CanvasNode`s
 * (which carry extra render metadata) without juggling adapters.
 */
export function computeBounds(nodes: { x: number; y: number }[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX, minY, maxX, maxY };
}
