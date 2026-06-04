import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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
  /** Display controls. Defaults keep the graph fully visible. */
  showLinks?: boolean;
  showNodes?: boolean;
  showText?: boolean;
  showArrows?: boolean;
  labelFade?: number;
  nodeScale?: number;
  linkWidth?: number;
  showGrid?: boolean;
  /** Base opacity for non-highlighted links. */
  linkOpacity?: number;
  /** When true, dimmed graph elements recede harder so the focus pops. */
  focusMode?: boolean;
};

const DEFAULT_LABEL_FADE = 0.48;
const DEFAULT_NODE_SCALE = 1;
const DEFAULT_LINK_WIDTH = 0.72;

// Visual constants. We keep these here (not as Tailwind classes) because
// SVG elements need actual `fill`/`stroke` attributes — a class with a
// background-color does nothing on a `<circle>`.
const NODE_FILL = '#b8babf';
const NODE_STROKE = '#d7d8dc';
const NODE_FILL_DIM = '#515359';
const NODE_STROKE_DIM = '#3f4147';
const NODE_SELECTED = '#d53f5f';
const NODE_SELECTED_STROKE = '#f0a2b1';
const EDGE_STROKE = '#484a50';
const EDGE_STROKE_HIGHLIGHT = '#d53f5f';
const LABEL_FILL = '#e6e6e8';
const LABEL_STROKE = '#1d1d1f';
const CANVAS_BG = '#1d1d1f';
const CANVAS_DOT = 'rgba(255,255,255,0.10)';
const CANVAS_GRID = 'rgba(255,255,255,0.07)';

const FULL_OPACITY = 1;
const DEFAULT_LINK_OPACITY = 0.24;

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
      showLinks = true,
      showNodes = true,
      showText = true,
      showArrows = false,
      labelFade = DEFAULT_LABEL_FADE,
      nodeScale = DEFAULT_NODE_SCALE,
      linkWidth = DEFAULT_LINK_WIDTH,
      showGrid = false,
      linkOpacity = DEFAULT_LINK_OPACITY,
      focusMode = false,
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
    const [hoveredId, setHoveredId] = useState<NotePath | null>(null);

    useEffect(() => {
      if (hoveredId !== null && !nodeById.has(hoveredId)) {
        setHoveredId(null);
      }
    }, [hoveredId, nodeById]);

    // Degree threshold for showing labels. Recomputed on every render but
    // it's a single pass over `nodes` and the parent already memoised the
    // degree value into each CanvasNode.
    const labelDegreeThreshold = labelDegreeAtQuantile(nodes, LABEL_TOP_DEGREE_QUANTILE);
    const labelMinScale = 0.68 + clampNumber(labelFade, 0, 1) * 0.95;
    const showLabels = initialView.scale >= labelMinScale;
    const radiusScale = clampNumber(nodeScale, 0.45, 2.25);
    const baseLinkWidth = clampNumber(linkWidth, 0.25, 4);
    // We use the *initial* scale only for the static flag. The live
    // scale is in viewRef but we don't toggle labels on every wheel
    // tick — that would defeat the purpose of the imperative transform.
    // The parent re-issues `initialView` after panning settles, which
    // is when label visibility actually matters.

    const isFiltered = matchedIds.size > 0;
    const activeId = hoveredId ?? selectedId;
    const hasInteraction = activeId !== null;
    const activeNeighborIds = useMemo<ReadonlySet<NotePath>>(() => {
      if (hoveredId === null) return neighborIds;
      const set = new Set<NotePath>();
      for (const edge of edges) {
        if (edge.source === hoveredId) set.add(edge.target);
        if (edge.target === hoveredId) set.add(edge.source);
      }
      return set;
    }, [hoveredId, edges, neighborIds]);
    const dimOpacity = focusMode ? Math.max(0.08, DIM_OPACITY * 0.55) : DIM_OPACITY;

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

    const handleNodeMouseDown = useCallback((e: React.MouseEvent<SVGGElement>) => {
      e.stopPropagation();
    }, []);

    const handleNodeMouseEnter = useCallback((id: NotePath) => {
      setHoveredId(id);
    }, []);

    const handleNodeMouseLeave = useCallback((id: NotePath) => {
      setHoveredId((cur) => (cur === id ? null : cur));
    }, []);

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
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9a9ca2" />
          </marker>
        </defs>

        <rect data-graph-surface="ziba-dark" width={width} height={height} fill={CANVAS_BG} />
        {showGrid && (
          <rect
            data-graph-grid="true"
            width={width}
            height={height}
            fill="url(#global-graph-grid)"
            opacity="0.42"
          />
        )}

        <g ref={transformRef} transform={transformString(initialView)}>
          {clusterOverlayOn && <HullsLayer nodes={nodes} hiddenTypes={hiddenHullTypes} />}
          {/* Edges first so node circles paint on top. */}
          {showLinks && (
            <g pointerEvents="none">
              {edges.map((e, i) => {
                const a = nodeById.get(e.source) ?? null;
                const b = nodeById.get(e.target) ?? null;
                if (a === null || b === null) return null;
                const highlight =
                  activeId !== null && (e.source === activeId || e.target === activeId);
                // Links stay neutral by default. Relation-kind colour
                // only appears when the user has explicitly filtered to kinds.
                const stroke =
                  highlightKinds.size > 0 && highlightKinds.has(e.kind)
                    ? kindToHsl(e.kind)
                    : highlight
                      ? EDGE_STROKE_HIGHLIGHT
                      : EDGE_STROKE;
                const dimByKindFilter = highlightKinds.size > 0 && !highlightKinds.has(e.kind);
                const dimByTypeFilter =
                  highlightType !== null &&
                  !(nodeMatchesType(a, highlightType) && nodeMatchesType(b, highlightType));
                const dim =
                  dimByKindFilter ||
                  dimByTypeFilter ||
                  (hasInteraction && !highlight) ||
                  (isFiltered && !(matchedIds.has(e.source) && matchedIds.has(e.target)));
                const opacity = dim
                  ? Math.min(linkOpacity * 0.55, dimOpacity)
                  : highlight
                    ? Math.min(FULL_OPACITY, linkOpacity * 3.3)
                    : linkOpacity;
                const d = edgePath(a, b);
                return (
                  <path
                    key={`${e.source}->${e.target}-${i}`}
                    data-graph-edge="true"
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={highlight ? baseLinkWidth * 1.75 : baseLinkWidth}
                    opacity={opacity}
                    markerEnd={showArrows ? 'url(#global-graph-arrow)' : undefined}
                  />
                );
              })}
            </g>
          )}

          {/* Nodes. */}
          {showNodes && (
            <g>
              {nodes.map((n) => {
                const isSelected = selectedId === n.id;
                const isHovered = hoveredId === n.id;
                const isActive = activeId === n.id;
                const isNeighbor = activeNeighborIds.has(n.id);
                const matchesFilter = !isFiltered || matchedIds.has(n.id);
                // When highlightType is null the filter is inactive — no node should be dimmed
                // purely because of type. When non-null, only nodes of that type stay bright.
                const isHighlightedByType = highlightType === null || n.type === highlightType;
                // Type filter takes unconditional precedence: even a
                // neighbour of the selected node is dimmed when it sits
                // outside the active type scope. This keeps node dimming
                // visually consistent with the hull visibility rule.
                const dim =
                  (hasInteraction && !isActive && !isNeighbor && !isSelected) ||
                  (isFiltered && !matchesFilter) ||
                  !isHighlightedByType;
                const opacity = dim ? dimOpacity : FULL_OPACITY;
                const labelEligible = showText && showLabels && n.degree >= labelDegreeThreshold;
                const showNodeLabel =
                  showText && (labelEligible || isSelected || isActive || isNeighbor);
                const radius = Math.max(2.4, n.r * radiusScale);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className="cursor-pointer"
                    onClick={(e): void => handleNodeClick(e, n.id)}
                    onDoubleClick={(e): void => handleNodeDoubleClick(e, n.id)}
                    onMouseDown={handleNodeMouseDown}
                    onMouseEnter={(): void => handleNodeMouseEnter(n.id)}
                    onMouseLeave={(): void => handleNodeMouseLeave(n.id)}
                    opacity={opacity}
                  >
                    {/*
                    Native browser tooltip — cheap, accessible, and
                    avoids re-mounting an HTML overlay on hover. For
                    1000 nodes that matters.
                  */}
                    <title>{n.title}</title>
                    {isSelected && (
                      <circle
                        r={radius + 8}
                        fill="rgba(213,63,95,0.14)"
                        stroke="rgba(213,63,95,0.34)"
                        strokeWidth={1}
                      />
                    )}
                    {isHovered && !isSelected && (
                      <circle
                        r={radius + 6.5}
                        fill="rgba(240,240,242,0.10)"
                        stroke="rgba(240,240,242,0.32)"
                        strokeWidth={1}
                      />
                    )}
                    <circle
                      r={radius}
                      fill={
                        dim
                          ? NODE_FILL_DIM
                          : isSelected
                            ? NODE_SELECTED
                            : n.color !== null
                              ? n.color
                              : NODE_FILL
                      }
                      stroke={
                        dim
                          ? NODE_STROKE_DIM
                          : isSelected
                            ? NODE_SELECTED_STROKE
                            : isHovered
                              ? '#f0f0f2'
                              : NODE_STROKE
                      }
                      strokeWidth={isSelected || isHovered ? 1.8 : 0.9}
                    />
                    {showNodeLabel && (
                      <text
                        x={radius + 3.8}
                        y={3}
                        fontSize={10}
                        fontWeight={560}
                        fill={LABEL_FILL}
                        stroke={LABEL_STROKE}
                        strokeWidth={3.2}
                        paintOrder="stroke"
                        pointerEvents="none"
                      >
                        {truncate(n.title, 24)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </g>
      </svg>
    );
  }),
);

function nodeMatchesType(n: CanvasNode, type: string): boolean {
  return n.type === type;
}

function edgePath(a: CanvasNode, b: CanvasNode): string {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
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

function clampNumber(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
