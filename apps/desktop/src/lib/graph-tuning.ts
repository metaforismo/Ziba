// Tuning constants for the global vault graph (v0.3).
//
// Mirrors the structure of `lib/timings.ts`: one place to look when
// the graph "feels off" — labels too cluttered, fit-to-screen too
// tight, dim-others not dim enough. Each constant carries a comment
// on the reasoning behind its value.

/**
 * Logical viewBox width. The SVG is rendered into the available space
 * via `preserveAspectRatio="xMidYMid meet"`, so this is purely the
 * coordinate system the layout simulator works in. Big enough that
 * 1000 nodes don't overlap visibly at 1× zoom; small enough that the
 * default fit-to-screen on a 1400-wide window doesn't squash labels
 * to unreadable pixel size.
 */
export const GRAPH_CANVAS_WIDTH = 2000;

/**
 * Logical viewBox height. ~7:5 ratio with width — favours the
 * horizontal so most vaults' organic clustering lays out neatly
 * without bleeding off the top/bottom.
 */
export const GRAPH_CANVAS_HEIGHT = 1400;

/** Minimum zoom factor (fully zoomed out — useful for dense vaults). */
export const GRAPH_ZOOM_MIN = 0.1;

/** Maximum zoom factor — beyond ~6× pixel art kicks in and labels feel jittery. */
export const GRAPH_ZOOM_MAX = 6;

/**
 * Padding (in viewBox units) that fit-to-screen leaves around the node
 * cloud. Without this, edge nodes sit flush with the viewport border
 * and arrows clip.
 */
export const GRAPH_FIT_PADDING = 40;

/**
 * Above this node count we still attempt the hand-rolled O(n²)
 * simulation but emit `console.warn` so devs notice if a real vault
 * exceeds it. v0.4 may switch to a Barnes-Hut approximation behind
 * the same `simulateLayout` interface.
 */
export const GRAPH_LARGE_THRESHOLD = 1000;

/**
 * Quantile threshold for showing labels at high zoom: only nodes whose
 * degree is in this top fraction get labels rendered. Keeps the canvas
 * readable on hub-and-spoke vaults where one note has 100+ neighbours.
 */
export const GRAPH_LABEL_TOP_DEGREE_QUANTILE = 0.85;

/**
 * Opacity applied to non-neighbour nodes/edges when one node is
 * selected. 0.18 keeps them visible enough to maintain spatial context
 * (so the user doesn't lose track of the surrounding cluster) without
 * competing with the highlighted neighbours.
 */
export const GRAPH_DIM_OPACITY = 0.18;
