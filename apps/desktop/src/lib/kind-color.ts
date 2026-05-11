const SATURATION_PCT = 60;
const LIGHTNESS_PCT = 42;

/**
 * Deterministic kind → HSL color. The empty-string sentinel (generic
 * body wikilink, the `kind = ''` value used throughout the relations
 * table) maps to a neutral grey so the constellation graph can
 * distinguish "no kind" from a real relation kind without an extra
 * branch in the renderer.
 *
 * Uses djb2 modulo 360 for the hue. Saturation and lightness are
 * fixed so the palette stays visually coherent across kinds.
 */
export function kindToHsl(kind: string): string {
  if (kind === '') return 'hsl(0, 0%, 45%)';
  let hash = 5381;
  for (let i = 0; i < kind.length; i++) {
    hash = ((hash << 5) + hash + kind.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, ${SATURATION_PCT}%, ${LIGHTNESS_PCT}%)`;
}
