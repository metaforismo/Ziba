export type HullPoint = { x: number; y: number };

/**
 * Andrew's monotone-chain convex hull. O(n log n), no dependencies.
 * Returns the hull vertices in counter-clockwise order starting at
 * the lowest-then-leftmost point. Duplicate inputs are deduplicated
 * implicitly so the cross-product check never produces zero-area
 * artifacts.
 *
 * Edge cases:
 *   - 0 points → []
 *   - 1 point  → [the point]
 *   - 2+ collinear inputs → the two extreme points
 *   - duplicates → deduplicated; no degenerate hull
 */
export function convexHull(points: ReadonlyArray<HullPoint>): HullPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ x: points[0]!.x, y: points[0]!.y }];

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const uniq: HullPoint[] = [];
  for (const p of sorted) {
    const last = uniq[uniq.length - 1];
    if (last === undefined || last.x !== p.x || last.y !== p.y) uniq.push(p);
  }
  if (uniq.length < 2) return uniq;

  const cross = (o: HullPoint, a: HullPoint, b: HullPoint): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: HullPoint[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: HullPoint[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // The last point of each half is the start of the other half — drop
  // it so the concatenation doesn't repeat vertices.
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
