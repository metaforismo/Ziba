import { useMemo } from 'react';
import type { JSX } from 'react';
import { convexHull } from './convexHull';
import type { CanvasNode } from './Canvas';

const MIN_NODES_FOR_HULL = 3;
const HULL_FILL_OPACITY = 0.08;
const HULL_STROKE_OPACITY = 0.25;
const HULL_PADDING = 24;

type Props = {
  nodes: ReadonlyArray<CanvasNode>;
  /**
   * Types whose hulls should not render. Drives the visual response to
   * the type filter chip row: when a type is selected, every OTHER
   * type's hull is hidden so the active type stands alone.
   */
  hiddenTypes: ReadonlySet<string>;
};

/**
 * Renders one semi-transparent convex-hull polygon per type with
 * ≥ 3 visible nodes. Hulls sit underneath the nodes/edges layer in
 * the parent SVG. Color comes from the first node of the group that
 * has a non-null `color`; all nodes of a given type share the same
 * schema color in practice.
 */
export function HullsLayer({ nodes, hiddenTypes }: Props): JSX.Element | null {
  const hulls = useMemo(() => {
    const byType = new Map<string, CanvasNode[]>();
    for (const n of nodes) {
      if (n.type === null || n.type === '') continue;
      if (hiddenTypes.has(n.type)) continue;
      const bucket = byType.get(n.type);
      if (bucket === undefined) byType.set(n.type, [n]);
      else bucket.push(n);
    }
    const out: Array<{ type: string; color: string; path: string }> = [];
    for (const [type, group] of byType) {
      if (group.length < MIN_NODES_FOR_HULL) continue;
      const color = group.find((n) => n.color !== null)?.color ?? 'rgb(99, 102, 241)';
      const pts = convexHull(group.map((n) => ({ x: n.x, y: n.y })));
      if (pts.length < MIN_NODES_FOR_HULL) continue;
      const padded = padOutward(pts, HULL_PADDING);
      out.push({ type, color, path: polygonPath(padded) });
    }
    return out;
  }, [nodes, hiddenTypes]);

  if (hulls.length === 0) return null;
  return (
    <g aria-hidden="true">
      {hulls.map((h) => (
        <path
          key={h.type}
          d={h.path}
          fill={h.color}
          fillOpacity={HULL_FILL_OPACITY}
          stroke={h.color}
          strokeOpacity={HULL_STROKE_OPACITY}
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function polygonPath(pts: ReadonlyArray<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ') + ' Z';
}

/**
 * Inflate the polygon outward from its centroid by `pad` units so the
 * hull encloses node radii (not just centres).
 */
function padOutward(
  pts: ReadonlyArray<{ x: number; y: number }>,
  pad: number,
): Array<{ x: number; y: number }> {
  if (pts.length === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  return pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.0001) return { x: p.x, y: p.y };
    return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
  });
}
