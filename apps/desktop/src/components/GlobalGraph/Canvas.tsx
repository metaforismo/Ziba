import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { NotePath } from '@ziba/core';
import {
  GRAPH_DIM_OPACITY as DIM_OPACITY,
  GRAPH_LABEL_TOP_DEGREE_QUANTILE as LABEL_TOP_DEGREE_QUANTILE,
} from '../../lib/graph-tuning';
import { kindToHsl } from '../../lib/kind-color';
import { HullsLayer } from './HullsLayer';

/**
 * Stylable graph node with the bits the canvas needs to render. We keep
 * this independent of the IPC `GraphNode` shape so the parent can fold
 * in derived display state (radius, label, dimming) without polluting
 * the wire format.
 */
export type CanvasNode = {
  id: NotePath;
  x: number;
  y: number;
  /** Visual radius. Driven by the parent's degree-based heuristic. */
  r: number;
  title: string;
  /** Pre-computed degree so the canvas can decide whether to label it. */
  degree: number;
  /** v1.0 Phase 5: type slug (null = untyped). */
  type: string | null;
  /** v1.0 Phase 5: hex color from the type's schema; canvas tints the fill. */
  color: string | null;
};

export type CanvasEdge = {
  source: NotePath;
  target: NotePath;
  /** v1.0 Phase 5: relation kind. `''` = generic body wikilink. */
  kind: string;
};

/** Initial transform handed to the canvas. */
export type CanvasView = {
  tx: number;
  ty: number;
  scale: number;
};

/**
 * Imperative handle returned to the parent so it can drive zoom/pan
 * without forcing a React re-render of every node on every wheel tick.
 *
 * Why imperative: at 1000 nodes a controlled `transform=...` attribute
 * means the entire SVG subtree reconciles 60 times a second while the
 * user pans. Mutating the `<g transform>` directly via a ref keeps the
 * frame budget firmly inside the SVG renderer, and React only sees the
 * final transform when the gesture ends.
 */
export type CanvasHandle = {
  /** Atomically replace the transform. */
  setView(view: CanvasView): void;
  /** Read the current transform (used when starting a pan gesture). */
  getView(): CanvasView;
};

type Props = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Canvas viewBox dimensions. Drives fit-to-screen math in the parent. */
  width: number;
  height: number;
  /** Initial pan/zoom; canvas owns the live value via ref afterwards. */
  initialView: CanvasView;
  /** Currently selected node — neighbours are highlighted, others dimmed. */
  selectedId: NotePath | null;
  /** Set of ids matching the search filter; non-matches dimmed. Empty = no filter. */
  matchedIds: ReadonlySet<NotePath>;
  /** Set of ids that are 1-hop neighbours of `selectedId`. */
  neighborIds: ReadonlySet<NotePath>;
  onNodeClick(id: NotePath): void;
  onNodeDoubleClick(id: NotePath): void;
  /** Mousedown on background — parent starts a pan gesture. */
  onBackgroundMouseDown(e: React.MouseEvent<SVGSVGElement>): void;
  /** Wheel — parent decides whether to zoom (only when over the canvas). */
  onWheel(e: React.WheelEvent<SVGSVGElement>): void;
  /** Click on background (not bubbled from a node) — clears selection. */
  onBackgroundClick(): void;
  /** True while a pan gesture is in progress; switches to grabbing cursor. */
  panning: boolean;
  /** v1.0 Phase 5: when true, render convex-hull overlays per type. */
  clusterOverlayOn: boolean;
  /** v1.0 Phase 5: when non-null, fade nodes/edges not matching this type. */
  highlightType: string | null;
  /**
   * v1.0 Phase 5: when non-empty, only edges whose `kind` is in this
   * set render at full opacity. Empty set means "all kinds shown".
   */
  highlightKinds: ReadonlySet<string>;
};

// Below this scale we hide labels entirely — they pile up and become
// unreadable. Above 1.5x we show labels but only for the most-connected
// nodes (the quantile threshold lives in `lib/graph-tuning.ts`).
const LABEL_MIN_SCALE = 1.5;

// Visual constants. We keep these here (not as Tailwind classes) because
// SVG elements need actual `fill`/`stroke` attributes — a class with a
// background-color does nothing on a `<circle>`.
const NODE_FILL = 'rgb(var(--accent) / 0.18)';
const NODE_STROKE = 'rgb(var(--accent))';
const NODE_FILL_DIM = 'rgb(var(--bg-muted))';
const NODE_STROKE_DIM = 'rgb(var(--border))';
// EDGE_STROKE removed: edges now use kindToHsl() for per-kind color.
const EDGE_STROKE_HIGHLIGHT = 'rgb(var(--accent))';
const LABEL_FILL = 'rgb(var(--fg))';
const CANVAS_BG = 'rgb(var(--bg))';
const CANVAS_DOT = 'rgb(var(--fg-muted) / 0.16)';
const CANVAS_GRID = 'rgb(var(--border) / 0.32)';
const CANVAS_HALO = 'rgb(var(--accent) / 0.08)';

const FULL_OPACITY = 1;

const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

function transformString(view: CanvasView): string {
  return `translate(${view.tx} ${view.ty}) scale(${view.scale})`;
}

/**
 * The SVG canvas. Pan/zoom is handled imperatively via a ref to the
 * `<g>` group so we don't re-render React on every gesture frame.
 *
 * `memo` because the parent re-renders on every selection / search
 * change; without it we'd repaint the entire subtree (potentially
 * thousands of `<circle>` elements) on every keystroke. The memo
 * compares props shallowly, which is fine — `nodes`/`edges` change
 * reference whenever the layout actually changes, and the selection /
 * filter sets are produced via `useMemo` upstream.
 */
export const Canvas = memo(
  forwardRef<CanvasHandle, Props>(function Canvas(props, ref): JSX.Element {
    const {
      nodes,
      edges,
      width,
      height,
      initialView,
      selectedId,
      matchedIds,
      neighborIds,
      onNodeClick,
      onNodeDoubleClick,
      onBackgroundMouseDown,
      onWheel,
      onBackgroundClick,
      panning,
      clusterOverlayOn,
      highlightType,
      highlightKinds,
    } = props;

    // The single source of truth for the live transform. We mirror it
    // into a state-less ref so wheel events can read+write it without
    // going through React's render cycle.
    const transformRef = useRef<SVGGElement | null>(null);
    const viewRef = useRef<CanvasView>(initialView);

    // When the parent hands us a fresh `initialView` (e.g. after a
    // fit-to-screen), apply it once. Subsequent pan/zoom is driven via
    // the imperative handle and bypasses this effect.
    useEffect(() => {
      viewRef.current = initialView;
      const g = transformRef.current;
      if (g !== null) {
        g.setAttribute('transform', transformString(initialView));
      }
    }, [initialView]);

    useImperativeHandle(
      ref,
      (): CanvasHandle => ({
        setView(v) {
          viewRef.current = v;
          const g = transformRef.current;
          if (g !== null) {
            g.setAttribute('transform', transformString(v));
          }
        },
        getView() {
          return viewRef.current;
        },
      }),
      [],
    );

    // O(N) Map built once per nodes reference change. Edges reference nodes
    // by id for every render; without this Map each edge lookup would be
    // O(N), making edge rendering O(E·N) — ~5M comparisons at 1000 nodes /
    // 5000 edges. The Map keeps it O(E).
    const nodeById = useMemo(() => {
      const m = new Map<NotePath, CanvasNode>();
      for (const n of nodes) m.set(n.id, n);
      return m;
    }, [nodes]);

    // Degree threshold for showing labels. Recomputed on every render but
    // it's a single pass over `nodes` and the parent already memoised the
    // degree value into each CanvasNode.
    const labelDegreeThreshold = labelDegreeAtQuantile(nodes, LABEL_TOP_DEGREE_QUANTILE);
    const showLabels = initialView.scale >= LABEL_MIN_SCALE;
    // We use the *initial* scale only for the static flag. The live
    // scale is in viewRef but we don't toggle labels on every wheel
    // tick — that would defeat the purpose of the imperative transform.
    // The parent re-issues `initialView` after panning settles, which
    // is when label visibility actually matters.

    const isFiltered = matchedIds.size > 0;
    const hasSelection = selectedId !== null;

    // When a specific type is highlighted, hide every other type's hull
    // so the visual focus matches the dimmed nodes.
    const hiddenHullTypes = useMemo<ReadonlySet<string>>(() => {
      if (highlightType === null) return EMPTY_STRING_SET;
      const set = new Set<string>();
      for (const n of nodes) {
        if (n.type !== null && n.type !== '' && n.type !== highlightType) {
          set.add(n.type);
        }
      }
      return set;
    }, [nodes, highlightType]);

    const handleNodeClick = useCallback(
      (e: React.MouseEvent<SVGGElement>, id: NotePath) => {
        e.stopPropagation();
        onNodeClick(id);
      },
      [onNodeClick],
    );

    const handleNodeDoubleClick = useCallback(
      (e: React.MouseEvent<SVGGElement>, id: NotePath) => {
        e.stopPropagation();
        onNodeDoubleClick(id);
      },
      [onNodeDoubleClick],
    );

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={`block h-full w-full select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        role="img"
        aria-label="Grafo globale del vault"
        onMouseDown={onBackgroundMouseDown}
        onWheel={onWheel}
        onClick={onBackgroundClick}
      >
        <defs>
          <radialGradient id="global-graph-surface" cx="50%" cy="42%" r="72%">
            <stop offset="0%" stopColor={CANVAS_HALO} />
            <stop offset="58%" stopColor="rgb(var(--bg-subtle) / 0.48)" />
            <stop offset="100%" stopColor={CANVAS_BG} />
          </radialGradient>
          <pattern
            id="global-graph-grid"
            x="0"
            y="0"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke={CANVAS_GRID} strokeWidth="0.6" />
            <circle cx="0" cy="0" r="1.05" fill={CANVAS_DOT} />
          </pattern>
          {/*
            Tiny arrow markers at the target end of each edge. We use a
            single neutral colour and let opacity carry the highlight —
            cheaper than swapping markers on selection.
          */}
          <marker
            id="global-graph-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--fg-muted))" />
          </marker>
        </defs>

        <rect width={width} height={height} fill="url(#global-graph-surface)" />
        <rect width={width} height={height} fill="url(#global-graph-grid)" opacity="0.46" />

        <g ref={transformRef} transform={transformString(initialView)}>
          {clusterOverlayOn && <HullsLayer nodes={nodes} hiddenTypes={hiddenHullTypes} />}
          {/* Edges first so node circles paint on top. */}
          <g pointerEvents="none">
            {edges.map((e, i) => {
              const a = nodeById.get(e.source) ?? null;
              const b = nodeById.get(e.target) ?? null;
              if (a === null || b === null) return null;
              const highlight =
                hasSelection && (e.source === selectedId || e.target === selectedId);
              // When a node is selected (highlight), use accent color regardless of kind —
              // the selection visual takes precedence over kind information.
              const kindColor = kindToHsl(e.kind);
              const stroke = highlight ? EDGE_STROKE_HIGHLIGHT : kindColor;
              const dimByKindFilter = highlightKinds.size > 0 && !highlightKinds.has(e.kind);
              const dimByTypeFilter =
                highlightType !== null &&
                !(nodeMatchesType(a, highlightType) && nodeMatchesType(b, highlightType));
              const dim =
                dimByKindFilter ||
                dimByTypeFilter ||
                (hasSelection && !highlight) ||
                (isFiltered && !(matchedIds.has(e.source) && matchedIds.has(e.target)));
              return (
                <line
                  key={`${e.source}->${e.target}-${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={highlight ? 1.2 : 0.8}
                  opacity={dim ? DIM_OPACITY : FULL_OPACITY}
                  markerEnd="url(#global-graph-arrow)"
                />
              );
            })}
          </g>

          {/* Nodes. */}
          <g>
            {nodes.map((n) => {
              const isSelected = selectedId === n.id;
              const isNeighbor = neighborIds.has(n.id);
              const matchesFilter = !isFiltered || matchedIds.has(n.id);
              // When highlightType is null the filter is inactive — no node should be dimmed
              // purely because of type. When non-null, only nodes of that type stay bright.
              const isHighlightedByType = highlightType === null || n.type === highlightType;
              // Type filter takes unconditional precedence: even a
              // neighbour of the selected node is dimmed when it sits
              // outside the active type scope. This keeps node dimming
              // visually consistent with the hull visibility rule.
              const dim =
                (hasSelection && !isSelected && !isNeighbor) ||
                (isFiltered && !matchesFilter) ||
                !isHighlightedByType;
              const opacity = dim ? DIM_OPACITY : FULL_OPACITY;
              const labelEligible = showLabels && n.degree >= labelDegreeThreshold;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="cursor-pointer"
                  onClick={(e): void => handleNodeClick(e, n.id)}
                  onDoubleClick={(e): void => handleNodeDoubleClick(e, n.id)}
                  opacity={opacity}
                >
                  {/*
                    Native browser tooltip — cheap, accessible, and
                    avoids re-mounting an HTML overlay on hover. For
                    1000 nodes that matters.
                  */}
                  <title>{n.title}</title>
                  <circle
                    r={n.r}
                    fill={
                      dim
                        ? NODE_FILL_DIM
                        : isSelected
                          ? NODE_STROKE
                          : n.color !== null
                            ? n.color
                            : NODE_FILL
                    }
                    stroke={dim ? NODE_STROKE_DIM : NODE_STROKE}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  {labelEligible && (
                    <text
                      x={n.r + 3}
                      y={3}
                      fontSize={9}
                      fontWeight={500}
                      fill={LABEL_FILL}
                      pointerEvents="none"
                    >
                      {truncate(n.title, 24)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    );
  }),
);

function nodeMatchesType(n: CanvasNode, type: string): boolean {
  return n.type === type;
}

function labelDegreeAtQuantile(nodes: CanvasNode[], q: number): number {
  if (nodes.length === 0) return Infinity;
  const degrees = nodes.map((n) => n.degree).sort((a, b) => a - b);
  const idx = Math.min(degrees.length - 1, Math.floor(degrees.length * q));
  // `degrees` is non-empty (length > 0) and `idx` is clamped to its last
  // valid index, so `at(idx)` cannot be undefined here. The guard is
  // there for `noUncheckedIndexedAccess`.
  return degrees[idx] ?? 0;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}
