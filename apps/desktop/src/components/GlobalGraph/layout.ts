// Force-directed layout for the full-vault graph.
//
// Implementation choice: re-uses the hand-rolled simulator from
// `MiniGraph/layout.ts`. That simulator was written for a 1-hop
// neighbourhood (5–30 nodes) and uses the obvious O(n²) repulsion loop,
// but it scales acceptably to the v0.3 target ("works at <500 nodes")
// when we crank the iteration count up and tune the force constants.
//
// We deliberately do NOT pull in `d3-force` or `vis-network` — for v0.3
// we want to keep the renderer bundle small and the math legible. If a
// real-world vault hits the multi-thousand-node range and the layout
// pass becomes a UX problem, v0.4 can swap in a Barnes-Hut quadtree
// approximation behind this same `runGlobalLayout` API; the rest of the
// component does not need to change.
//
// We also explicitly do NOT import the `'self'` semantics from the
// mini-graph — there is no anchor node in a vault-wide view, so every
// node is free to move. The `'outbound'` kind is used as an arbitrary
// label so the existing `LayoutNode` shape lines up.

import {
  initializeOnCircle as miniInitializeOnCircle,
  simulateLayout as miniSimulateLayout,
  type LayoutEdge,
  type LayoutNode,
} from '../MiniGraph/layout';

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
};

// Force constants tuned for vault-scale graphs (50–1000 nodes).
//
// `kRepulsive` is the dominant cost in O(n²). With many nodes the cloud
// would otherwise collapse onto itself, so we bump repulsion well above
// the mini-graph's ~1800 to keep the layout open and readable. Springs
// are softer (smaller `kAttractive`) because the average degree is much
// higher and a stiff spring would knot tightly-coupled clusters. The
// rest length is shorter because the canvas is fixed-size and we'd
// rather see a denser graph than a graph that overflows its bounds.
const GLOBAL_DEFAULTS = {
  kRepulsive: 6500,
  kAttractive: 0.025,
  restLen: 55,
  damping: 0.82,
  kCenter: 0.01,
} as const;

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
export function initializePositions(ids: string[], width: number, height: number): LayoutNode[] {
  // Radius scales with sqrt(n) so a denser graph gets a wider initial
  // ring — keeps the average per-node distance roughly constant at t=0
  // and the simulator doesn't have to spend its first dozen ticks just
  // pushing things apart.
  const radius = Math.min(width, height) / 2 - 24;
  const seedRadius = Math.max(60, Math.min(radius, 30 + Math.sqrt(ids.length) * 8));
  return miniInitializeOnCircle(
    ids.map((id) => ({ id, kind: 'outbound' as const })),
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
  const iterations = opts.iterations ?? defaultIterations(nodes.length);
  return miniSimulateLayout(nodes, edges, {
    width: opts.width,
    height: opts.height,
    iterations,
    kRepulsive: GLOBAL_DEFAULTS.kRepulsive,
    kAttractive: GLOBAL_DEFAULTS.kAttractive,
    restLen: GLOBAL_DEFAULTS.restLen,
    damping: GLOBAL_DEFAULTS.damping,
    kCenter: GLOBAL_DEFAULTS.kCenter,
  });
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
