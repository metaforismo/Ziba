import { describe, expect, it } from 'vitest';
import { initializePositions, resolveGlobalForces, runGlobalLayout } from './layout';
import {
  initializeOnCircle,
  simulateLayout,
  type LayoutEdge,
  type LayoutNode,
} from '../MiniGraph/layout';

describe('cluster bias', () => {
  it('with intra-group edges, cluster bias increases same-type centroid separation versus no bias', () => {
    // Two groups of 10, connected within their group plus one bridge.
    // The intra-group edges provide a restoring force that prevents
    // nodes from flying apart; the cluster-bias force then pushes the
    // two type centroids further from each other than repulsion alone.
    // This is the primary regression guard: it fails if the cluster-bias
    // loop is removed (kClusterStrength = 0).
    const bookIds = Array.from({ length: 10 }, (_, i) => `b${i}`);
    const personIds = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const ids = [...bookIds, ...personIds];
    const typeById = new Map<string, string>([
      ...bookIds.map((id): [string, string] => [id, 'book']),
      ...personIds.map((id): [string, string] => [id, 'person']),
    ]);
    const edges: LayoutEdge[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ source: `b${i}`, target: `b${i + 1}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ source: `p${i}`, target: `p${i + 1}` })),
      // Single bridge — keeps both chains in the same force field without
      // strongly pulling the two groups together.
      { source: 'b9', target: 'p0' },
    ];

    function runAndMeasureSep(kCluster: number): number {
      const nodes: LayoutNode[] = initializePositions(ids, 1000, 1000, typeById);
      simulateLayout(nodes, edges, {
        width: 1000,
        height: 1000,
        iterations: 800,
        kRepulsive: 6500,
        kAttractive: 0.025,
        restLen: 55,
        damping: 0.82,
        kCenter: 0.01,
        kClusterStrength: kCluster,
      });
      const books = nodes.filter((n) => n.nodeType === 'book');
      const people = nodes.filter((n) => n.nodeType === 'person');
      return dist(centroid(books), centroid(people));
    }

    const sepWithout = runAndMeasureSep(0);
    const sepWith = runAndMeasureSep(0.3);

    // Cluster bias must increase inter-group centroid separation by at
    // least 10% beyond what repulsion + edge-springs alone achieve.
    expect(sepWith).toBeGreaterThan(sepWithout * 1.1);
  });

  it('nodeType is stamped on nodes returned by initializePositions', () => {
    // Verifies the nodeType propagation path from typeById → LayoutNode,
    // including the null / empty-string guard.
    const ids = ['a', 'b', 'c', 'd'];
    const typeById = new Map<string, string | null>([
      ['a', 'book'],
      ['b', 'person'],
      ['c', null], // explicit null → no nodeType field
      ['d', ''], // empty string → no nodeType field
    ]);
    const nodes = initializePositions(ids, 800, 800, typeById);

    const a = nodes.find((n) => n.id === 'a');
    const b = nodes.find((n) => n.id === 'b');
    const c = nodes.find((n) => n.id === 'c');
    const d = nodes.find((n) => n.id === 'd');

    expect(a?.nodeType).toBe('book');
    expect(b?.nodeType).toBe('person');
    expect(c?.nodeType).toBeUndefined();
    expect(d?.nodeType).toBeUndefined();
  });

  it('an untyped node is not assigned a nodeType even when typeById maps it to null', () => {
    // Ensures the null guard in initializePositions keeps untyped nodes
    // out of the cluster-bias loop in simulateLayout.
    const ids = ['u', 'n0', 'n1'];
    const typeById = new Map<string, string | null>([
      ['u', null],
      ['n0', 'book'],
      ['n1', 'person'],
    ]);
    const nodes = initializePositions(ids, 800, 800, typeById);
    runGlobalLayout(nodes, [], { width: 800, height: 800, iterations: 200 });

    const untyped = nodes.find((n) => n.id === 'u');
    expect(untyped).toBeDefined();
    expect(untyped!.nodeType).toBeUndefined();
  });

  it('maps graph force settings into concrete simulation constants', () => {
    const forces = resolveGlobalForces({
      center: 0.1,
      repel: 500,
      link: 0.12,
      linkDistance: 140,
      nodeDistance: 48,
      linkOpacity: 0.5,
    });

    expect(forces.chargeStrength).toBe(-500);
    expect(forces.linkStrength).toBeCloseTo(0.12);
    expect(forces.linkDistance).toBe(140);
    expect(forces.collideRadius).toBeCloseTo(25.28);
    expect(forces.centerStrength).toBeCloseTo(0.1);
  });

  it('runs the d3 global layout without NaN and keeps nodes inside bounds', () => {
    const ids = Array.from({ length: 36 }, (_, i) => `n${i}`);
    const edges: LayoutEdge[] = Array.from({ length: 35 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
    }));
    const nodes = initializePositions(ids, 900, 600);

    runGlobalLayout(nodes, edges, {
      width: 900,
      height: 600,
      iterations: 220,
      forces: {
        center: 0.08,
        repel: 420,
        link: 0.08,
        linkDistance: 96,
        nodeDistance: 32,
        linkOpacity: 0.24,
      },
    });

    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(28);
      expect(node.x).toBeLessThanOrEqual(872);
      expect(node.y).toBeGreaterThanOrEqual(28);
      expect(node.y).toBeLessThanOrEqual(572);
    }
  });

  it('mini-graph callers without kClusterStrength see identical output to explicit kClusterStrength=0', () => {
    // Regression guard: the cluster loop must be a strict no-op when
    // kClusterStrength is omitted, so existing mini-graph behaviour is
    // numerically unchanged.
    const ids = [
      { id: 's', kind: 'self' as const },
      { id: 'a', kind: 'outbound' as const },
      { id: 'b', kind: 'outbound' as const },
    ];
    const edges: LayoutEdge[] = [
      { source: 's', target: 'a' },
      { source: 's', target: 'b' },
    ];

    const nodes1 = initializeOnCircle(ids, 600, 600, 80);
    const nodes2 = initializeOnCircle(ids, 600, 600, 80);

    // Run one without kClusterStrength (mini-graph path) and one with
    // explicit 0 — they must produce identical results.
    simulateLayout(nodes1, edges, { width: 600, height: 600, iterations: 100 });
    simulateLayout(nodes2, edges, {
      width: 600,
      height: 600,
      iterations: 100,
      kClusterStrength: 0,
    });

    for (let i = 0; i < nodes1.length; i++) {
      expect(nodes1[i]!.x).toBeCloseTo(nodes2[i]!.x, 8);
      expect(nodes1[i]!.y).toBeCloseTo(nodes2[i]!.y, 8);
    }
  });
});

function centroid(ns: { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const n of ns) {
    sx += n.x;
    sy += n.y;
  }
  return { x: sx / ns.length, y: sy / ns.length };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
