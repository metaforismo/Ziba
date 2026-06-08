import { useMemo } from 'react';
import { useUiStore } from '../stores/ui';

/**
 * Resolved graph-surface colors for the active theme. Concrete CSS color
 * strings (`rgb(...)`) so they can be dropped straight into SVG
 * `fill`/`stroke` attributes — a Tailwind class does nothing on a
 * `<circle>`. The single source of truth is the `--graph-*` custom
 * properties defined per theme in `globals.css`; this hook just reads
 * them at runtime and re-reads when the theme changes.
 */
export type GraphPalette = {
  /** Logical canvas background (behind the dot grid). */
  bg: string;
  /** Default node fill (type/group colors still win over this). */
  node: string;
  /** Dimmed node fill (focus/filter recede state). */
  nodeMuted: string;
  /** Default edge stroke. */
  edge: string;
  /** Soft-reference (unlinked mention) edge stroke. */
  edgeMention: string;
  /** Node label / general graph text. */
  text: string;
  /** Secondary graph text (counts, captions). */
  textMuted: string;
  /** Selection accent (ring + selected node fill). */
  selection: string;
};

const FALLBACK: GraphPalette = {
  bg: 'rgb(29, 29, 31)',
  node: 'rgb(184, 186, 191)',
  nodeMuted: 'rgb(81, 83, 89)',
  edge: 'rgb(72, 74, 80)',
  edgeMention: 'rgb(110, 112, 120)',
  text: 'rgb(230, 230, 232)',
  textMuted: 'rgb(157, 157, 164)',
  selection: 'rgb(148, 169, 123)',
};

const VAR_NAMES = {
  bg: '--graph-bg',
  node: '--graph-node',
  nodeMuted: '--graph-node-muted',
  edge: '--graph-edge',
  edgeMention: '--graph-edge-mention',
  text: '--graph-text',
  textMuted: '--graph-text-muted',
  selection: '--graph-selection',
} as const;

/**
 * Read a `R G B` triplet CSS variable and wrap it as `rgb(R, G, B)`.
 * Returns null when the variable is missing/empty so the caller can fall
 * back (e.g. during SSR/tests where `document` has no computed styles).
 */
function readRgbVar(styles: CSSStyleDeclaration, name: string): string | null {
  const raw = styles.getPropertyValue(name).trim();
  if (raw === '') return null;
  // Stored as space-separated channels ("29 29 31") to support Tailwind's
  // `/ <alpha-value>`. Normalise to a comma form for SVG attributes.
  const channels = raw.split(/\s+/).slice(0, 3);
  if (channels.length < 3) return null;
  return `rgb(${channels.join(', ')})`;
}

export function resolveGraphPalette(): GraphPalette {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return FALLBACK;
  }
  const styles = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const key of Object.keys(VAR_NAMES) as Array<keyof typeof VAR_NAMES>) {
    const value = readRgbVar(styles, VAR_NAMES[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}

/**
 * Subscribe to the active theme and resolve the graph palette. The
 * `themeId` dependency ensures the colors re-resolve immediately after a
 * theme switch (the store applies the `data-theme` attribute + `.dark`
 * class synchronously, so by the time this memo runs the new CSS
 * variables are in effect).
 */
export function useGraphPalette(): GraphPalette {
  const themeId = useUiStore((s) => s.themeId);
  // `themeId` is intentionally the (only) dep: it has no textual use in
  // the callback, but switching themes is exactly what must force a
  // re-read of the `--graph-*` CSS variables. eslint can't see that the
  // resolved values depend on the active theme via the DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolveGraphPalette(), [themeId]);
}
