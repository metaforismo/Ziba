// Hand-rolled force-directed layout for the local-neighborhood mini-graph.
//
// Why hand-rolled and not d3-force / vis-network / cytoscape: a 1-hop
// neighborhood typically has 5–30 nodes. The full machinery of d3-force
// would add ~30KB gzipped to the renderer bundle for behavior we can
// implement in ~80 lines. The math here is intentionally simple — three
// forces (repulsion, edge-spring, centering) plus damping — which is
// plenty for a neighborhood graph and avoids the maintenance cost of a
// dependency we don't otherwise use.
//
// Pure function so it's trivially testable and can be invoked off the
// main thread later if the graph grows.

export type LayoutNodeKind = 'self' | 'inbound' | 'outbound' | 'broken';

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: LayoutNodeKind;
};

export type LayoutEdge = {
  source: string;
  target: string;
};

export type LayoutOptions = {
  width: number;
  height: number;
  iterations: number;
  /** Repulsive force coefficient. Larger = nodes spread further apart. */
  kRepulsive?: number;
  /** Edge-spring stiffness. Larger = edges pull harder toward `restLen`. */
  kAttractive?: number;
  /** Natural edge length. The spring is at rest when `dist === restLen`. */
  restLen?: number;
  /** Velocity damping per tick. < 1 so the system loses energy and settles. */
  damping?: number;
  /** Pull strength toward canvas center. Keeps the graph from drifting. */
  kCenter?: number;
};

const DEFAULTS = {
  kRepulsive: 1800,
  kAttractive: 0.04,
  restLen: 70,
  damping: 0.85,
  kCenter: 0.012,
} as const;

/**
 * Run a deterministic-ish force simulation in place over `nodes`.
 *
 * The "self" node is pinned to the canvas center on every tick — the
 * mini-graph is meant to be read with the open note at the middle, not
 * wherever the simulation happened to throw it. All other nodes are free.
 *
 * Returns the same `nodes` array (mutated) for caller convenience.
 */
export function simulateLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions,
): LayoutNode[] {
  const kRepulsive = opts.kRepulsive ?? DEFAULTS.kRepulsive;
  const kAttractive = opts.kAttractive ?? DEFAULTS.kAttractive;
  const restLen = opts.restLen ?? DEFAULTS.restLen;
  const damping = opts.damping ?? DEFAULTS.damping;
  const kCenter = opts.kCenter ?? DEFAULTS.kCenter;
  const cx = opts.width / 2;
  const cy = opts.height / 2;
  // Padding so node circles aren't clipped by the SVG viewBox edges.
  const padding = 18;
  const minX = padding;
  const minY = padding;
  const maxX = opts.width - padding;
  const maxY = opts.height - padding;

  for (let iter = 0; iter < opts.iterations; iter++) {
    // Repulsion: O(n^2). Cheap for n < ~50; we don't bother with a quadtree.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b === undefined) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          // Coincident: nudge by a deterministic offset so they separate.
          dx = (i - j) * 0.5 + 0.1;
          dy = (j - i) * 0.5 + 0.1;
          dist2 = dx * dx + dy * dy;
        }
        const dist = Math.sqrt(dist2);
        const force = kRepulsive / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Edge springs: pull each edge endpoint toward the natural rest length.
    for (const e of edges) {
      const a = nodes.find((n) => n.id === e.source);
      const b = nodes.find((n) => n.id === e.target);
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const delta = dist - restLen;
      const force = kAttractive * delta;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Centering: gentle pull toward the canvas center for non-self nodes.
    for (const n of nodes) {
      if (n.kind === 'self') continue;
      n.vx += (cx - n.x) * kCenter;
      n.vy += (cy - n.y) * kCenter;
    }

    // Integrate + damp + clamp.
    for (const n of nodes) {
      if (n.kind === 'self') {
        // Pin self to center. We still want it in the data structure so
        // edges resolve correctly and the renderer reads its position.
        n.x = cx;
        n.y = cy;
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < minX) {
        n.x = minX;
        n.vx = 0;
      } else if (n.x > maxX) {
        n.x = maxX;
        n.vx = 0;
      }
      if (n.y < minY) {
        n.y = minY;
        n.vy = 0;
      } else if (n.y > maxY) {
        n.y = maxY;
        n.vy = 0;
      }
    }
  }

  return nodes;
}

/**
 * Initialise positions on a circle around the canvas center.
 *
 * The "self" node goes at the center; everyone else is evenly spaced
 * around a ring whose radius is set by `restLen`. Starting from a circle
 * (rather than random) gives a more predictable settle and avoids the
 * "explosion" you get when two random points happen to land on top of
 * each other.
 */
export function initializeOnCircle(
  ids: { id: string; kind: LayoutNodeKind }[],
  width: number,
  height: number,
  radius: number,
): LayoutNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const others = ids.filter((n) => n.kind !== 'self');
  const self = ids.find((n) => n.kind === 'self');
  const result: LayoutNode[] = [];

  if (self !== undefined) {
    result.push({ id: self.id, kind: 'self', x: cx, y: cy, vx: 0, vy: 0 });
  }

  const n = others.length;
  for (let i = 0; i < n; i++) {
    const o = others[i];
    if (o === undefined) continue;
    // Start at the top (-π/2) and walk clockwise so layouts feel stable
    // when the same node set re-renders.
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    result.push({
      id: o.id,
      kind: o.kind,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    });
  }

  return result;
}
