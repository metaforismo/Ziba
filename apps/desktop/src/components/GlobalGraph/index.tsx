import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CornersOut,
  FunnelX,
  Gear,
  Graph as GraphIcon,
  MagnifyingGlass,
  Minus,
  Plus,
  X,
} from '@phosphor-icons/react';
import { MENTION_EDGE_KIND, UNRESOLVED_NODE_PREFIX, type NotePath } from '@ziba/core';
import type { FullGraph } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { debounce } from '../../lib/debounce';
import { GLOBAL_GRAPH_REFETCH_MS } from '../../lib/timings';
import { navigateToNote } from '../../lib/navigate';
import { deriveGraphView, deriveLocalGraphView } from '../../lib/graph-view';
import {
  Canvas,
  type CanvasEdge,
  type CanvasHandle,
  type CanvasNode,
  type CanvasView,
} from './Canvas';
import { computeBounds, initializePositions, runGlobalLayout } from './layout';
import { TypeChips, type TypeChip } from './TypeChips';
import { KindFilterDropdown } from './KindFilterDropdown';
import { Legend, type LegendGroup } from './Legend';
import { useTagsStore } from '../../stores/tags';
import { useVaultStore } from '../../stores/vault';
import { useGraphSettingsStore } from '../../stores/graph';
import { useEditorStore } from '../../stores/editor';
import { IconButton } from '../ui/IconButton';
import { SegmentedControl } from '../ui/SegmentedControl';
import { EmptyView } from '../ui/EmptyView';
import { GraphSettingsPanel, type GraphPreset } from './GraphSettingsPanel';
import type { GraphGroupRule } from '../../lib/graph-settings';
import { graphGroupQueryMatchesNode } from '../../lib/graph-groups';
import { useGraphPalette } from '../../lib/graph-palette';
import { nextGraphKeyboardView } from './keyboard';

// Logical canvas the simulation runs on. The SVG `viewBox` matches
// these numbers; on screen we just stretch to fill the container, with
// `preserveAspectRatio` keeping the layout undistorted.
// Tuning constants live in `lib/graph-tuning.ts` so the same values
// can be referenced by Canvas.tsx and any future graph variants. We
// alias to short local names here to keep the body readable.
import {
  GRAPH_CANVAS_WIDTH as CANVAS_W,
  GRAPH_CANVAS_HEIGHT as CANVAS_H,
  GRAPH_ZOOM_MIN as ZOOM_MIN,
  GRAPH_ZOOM_MAX as ZOOM_MAX,
  GRAPH_FIT_PADDING as FIT_PADDING,
  GRAPH_LARGE_THRESHOLD as LARGE_GRAPH_WARN_THRESHOLD,
  GRAPH_ANIMATION_NODE_CEILING,
} from '../../lib/graph-tuning';
import { useCameraTween } from '../../lib/graph-camera';

const NODE_R_MIN = 3;
const NODE_R_MAX = 18;
// Unresolved phantom nodes render at a fraction of a real note's
// degree-scaled radius so they read as subordinate "missing concept"
// discs (Obsidian).
const UNRESOLVED_RADIUS_SCALE = 0.62;

const ZOOM_STEP = 1.25;

type GraphScope = 'global' | 'local';

const GRAPH_SCOPE_ITEMS: ReadonlyArray<{ id: GraphScope; label: string }> = [
  { id: 'global', label: 'Globale' },
  { id: 'local', label: 'Locale' },
];

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; graph: FullGraph }
  | { kind: 'error'; message: string };

export function GlobalGraph(): JSX.Element {
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<NotePath | null>(null);
  const [graphScope, setGraphScope] = useState<GraphScope>('global');
  const [localRootId, setLocalRootId] = useState<NotePath | null>(null);
  const [clusterOverlayOn, setClusterOverlayOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [surfaceFullscreen, setSurfaceFullscreen] = useState(false);
  // We bump `viewVersion` whenever we want to force the canvas to apply
  // a fresh `initialView` (fit-to-screen, +/- zoom button). Pan/wheel
  // gestures bypass this and write directly into the canvas via its
  // imperative handle, so they don't re-render React per frame.
  const [view, setView] = useState<CanvasView>({ tx: 0, ty: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const requestSeq = useRef(0);
  const canvasRef = useRef<CanvasHandle | null>(null);
  const graphFrameRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  // Smooth RAF-driven camera glide. `onSettle` syncs the final transform
  // back into React state so later prop-driven renders don't snap the
  // camera back to its pre-tween position (same contract as the manual
  // pan/zoom settle paths).
  const { animateTo: animateCamera, cancel: cancelCameraTween } = useCameraTween(
    canvasRef,
    setView,
  );

  const palette = useGraphPalette();
  const currentPath = useEditorStore((s) => s.currentPath);
  const objectTypeSchemas = useTagsStore((s) => s.objectTypeSchemas);
  const currentVaultRoot = useVaultStore((s) => s.current?.root ?? null);
  const graphSettings = useGraphSettingsStore((s) => s.settings);
  const setGraphSettingsVaultRoot = useGraphSettingsStore((s) => s.setVaultRoot);
  const updateGraphQuery = useGraphSettingsStore((s) => s.updateQuery);
  const updateGraphDisplay = useGraphSettingsStore((s) => s.updateDisplay);
  const updateGraphForces = useGraphSettingsStore((s) => s.updateForces);
  const addGraphGroup = useGraphSettingsStore((s) => s.addGroup);
  const updateGraphGroup = useGraphSettingsStore((s) => s.updateGroup);
  const removeGraphGroup = useGraphSettingsStore((s) => s.removeGroup);
  const resetGraphSettings = useGraphSettingsStore((s) => s.resetSettings);
  const search = graphSettings.query.search;
  const selectedType = graphSettings.query.types[0] ?? null;
  const selectedKinds = useMemo<ReadonlySet<string>>(
    () => new Set(graphSettings.query.relationKinds),
    [graphSettings.query.relationKinds],
  );
  const filteredGraphView = useMemo(
    () => (load.kind === 'ready' ? deriveGraphView(load.graph, graphSettings) : null),
    [load, graphSettings],
  );
  const graphView = useMemo(() => {
    if (filteredGraphView === null) return null;
    if (graphScope === 'global') return filteredGraphView;
    if (localRootId === null) {
      return {
        ...filteredGraphView,
        graph: EMPTY_GRAPH,
        activeFilterCount: filteredGraphView.activeFilterCount + 1,
        hiddenNodeCount: load.kind === 'ready' ? load.graph.nodes.length : 0,
        hiddenEdgeCount: load.kind === 'ready' ? load.graph.edges.length : 0,
      };
    }

    const localView = deriveLocalGraphView(
      filteredGraphView.graph,
      localRootId,
      graphSettings.query.localDepth,
    );
    return {
      graph: localView.graph,
      activeFilterCount: filteredGraphView.activeFilterCount + 1,
      hiddenNodeCount: filteredGraphView.hiddenNodeCount + localView.hiddenNodeCount,
      hiddenEdgeCount: filteredGraphView.hiddenEdgeCount + localView.hiddenEdgeCount,
    };
  }, [filteredGraphView, graphScope, graphSettings.query.localDepth, load, localRootId]);
  const visibleGraph = graphView?.graph ?? EMPTY_GRAPH;

  useEffect(() => {
    if (search.trim() !== '') setSearchOpen(true);
  }, [search]);

  useEffect(() => {
    if (graphScope !== 'local') return;
    if (currentPath !== null) {
      setLocalRootId(currentPath);
    }
  }, [currentPath, graphScope]);

  useEffect(() => {
    if (graphScope !== 'local' || load.kind !== 'ready') return;
    setLocalRootId((current) => current ?? load.graph.nodes[0]?.path ?? null);
  }, [graphScope, load]);

  useEffect(() => {
    setGraphSettingsVaultRoot(currentVaultRoot);
  }, [currentVaultRoot, setGraphSettingsVaultRoot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchGraph = useCallback(async (quiet = false): Promise<void> => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoad({ kind: 'loading' });

    try {
      const graph = await ipc.getFullGraph();
      if (!mountedRef.current || seq !== requestSeq.current) return;
      if (graph.nodes.length > LARGE_GRAPH_WARN_THRESHOLD) {
        console.warn(
          `[GlobalGraph] vault has ${graph.nodes.length} nodes; layout may be slow (v0.3 ships d3-force simulation).`,
        );
      }
      setLoad({ kind: 'ready', graph });
    } catch (err: unknown) {
      if (!mountedRef.current || seq !== requestSeq.current) return;
      if (quiet) return;
      const message = ipcErrorMessage(err);
      setLoad({ kind: 'error', message });
    }
  }, []);

  // Initial fetch + watcher-driven refetch.
  useEffect(() => {
    void fetchGraph();

    const debouncedRefetch = debounce(() => {
      void fetchGraph(true);
    }, GLOBAL_GRAPH_REFETCH_MS);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return (): void => {
      offEvent();
      debouncedRefetch.cancel();
    };
  }, [fetchGraph]);

  // Build a quick lookup table: path → title. Used by Canvas-bound
  // nodes (we don't need to expose the full graph object to the canvas).
  const titleMap = useMemo<Map<NotePath, string>>(() => {
    const m = new Map<NotePath, string>();
    for (const n of visibleGraph.nodes) m.set(n.path, n.title);
    return m;
  }, [visibleGraph]);

  // Chip list for the type filter row. Sources from the graph nodes so
  // only types actually present in this vault appear.
  const typeChips = useMemo<TypeChip[]>(() => {
    if (load.kind !== 'ready') return [];
    const seen = new Set<string>();
    const byType = new Map<
      string,
      { id: string; label: string; icon: string | null; color: string | null }
    >();
    for (const n of load.graph.nodes) {
      if (n.type === null || n.type === '') continue;
      if (seen.has(n.type)) continue;
      seen.add(n.type);
      const schema = objectTypeSchemas.find((s) => s.id === n.type);
      byType.set(n.type, {
        id: n.type,
        label: schema?.label ?? n.type,
        icon: schema?.icon ?? null,
        // Node color wins over schema color because that's what the Canvas renders.
        color: n.color ?? schema?.color ?? null,
      });
    }
    return Array.from(byType.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [load, objectTypeSchemas]);

  // Distinct relation kinds present in the graph (empty-string sentinel
  // and the reserved mention sentinel excluded — mentions get their own
  // dedicated toggle).
  const kindOptions = useMemo<string[]>(() => {
    if (load.kind !== 'ready') return [];
    const seen = new Set<string>();
    for (const e of load.graph.edges) {
      if (e.kind !== '' && e.kind !== MENTION_EDGE_KIND) seen.add(e.kind);
    }
    return Array.from(seen).sort();
  }, [load]);

  // Whether the current graph has ANY soft references — drives whether
  // the mention toggle is offered at all.
  const hasMentionEdges = useMemo<boolean>(() => {
    if (load.kind !== 'ready') return false;
    return load.graph.edges.some((e) => e.kind === MENTION_EDGE_KIND);
  }, [load]);

  // path → type slug; feeds initializePositions for cluster-bias seeding.
  const typeById = useMemo<ReadonlyMap<NotePath, string | null>>(() => {
    const m = new Map<NotePath, string | null>();
    for (const n of visibleGraph.nodes) m.set(n.path, n.type);
    return m;
  }, [visibleGraph]);

  // Degree counts (in + out). Used to scale node radius and decide
  // which nodes get labels at high zoom.
  const degreeMap = useMemo<Map<NotePath, number>>(() => {
    const m = new Map<NotePath, number>();
    for (const n of visibleGraph.nodes) m.set(n.path, 0);
    for (const e of visibleGraph.edges) {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    }
    return m;
  }, [visibleGraph]);

  // Adjacency for 1-hop highlight. Built once per graph (not per
  // selection), so clicking around is cheap.
  const adjacency = useMemo<Map<NotePath, Set<NotePath>>>(() => {
    const m = new Map<NotePath, Set<NotePath>>();
    const ensure = (p: NotePath): Set<NotePath> => {
      let s = m.get(p);
      if (s === undefined) {
        s = new Set();
        m.set(p, s);
      }
      return s;
    };
    for (const e of visibleGraph.edges) {
      ensure(e.source).add(e.target);
      ensure(e.target).add(e.source);
    }
    return m;
  }, [visibleGraph]);

  // Run the force simulation. The deps key is the graph identity, so
  // re-renders driven by selection / search / pan don't re-simulate.
  const layout = useMemo(() => {
    if (load.kind !== 'ready') return null;
    const { nodes, edges } = visibleGraph;
    if (nodes.length === 0) return null;
    const positioned = initializePositions(
      nodes.map((n) => n.path),
      CANVAS_W,
      CANVAS_H,
      typeById,
    );
    runGlobalLayout(
      positioned,
      edges.map((e) => ({ source: e.source, target: e.target })),
      { width: CANVAS_W, height: CANVAS_H, forces: graphSettings.forces },
    );
    return positioned;
  }, [load.kind, visibleGraph, typeById, graphSettings.forces]);

  // Build the canvas-level node list. Memoised so the Canvas's
  // `memo()` shallow comparison sees a stable reference unless the
  // layout actually changed.
  const canvasNodes = useMemo<CanvasNode[]>(() => {
    if (layout === null) return [];
    const maxDegree = Array.from(degreeMap.values()).reduce((acc, v) => (v > acc ? v : acc), 0);
    const nodeMeta = new Map<
      NotePath,
      { type: string | null; color: string | null; unresolved: boolean }
    >();
    for (const n of visibleGraph.nodes) {
      nodeMeta.set(n.path, {
        type: n.type,
        // Monochrome redesign: node color comes ONLY from user-defined
        // group rules. The type-schema color (`n.color`) no longer tints
        // the node — that produced "too many colors". Phantom (unresolved)
        // nodes are forced gray and must never take a group color, so we
        // skip the group lookup for them entirely.
        color: n.unresolved === true ? null : groupColorForNode(n, graphSettings.groups),
        unresolved: n.unresolved === true,
      });
    }
    return layout.map((p) => {
      const degree = degreeMap.get(p.id) ?? 0;
      const meta = nodeMeta.get(p.id);
      const unresolved = meta?.unresolved ?? false;
      // Unresolved nodes read as smaller, dimmer "concept without a note"
      // discs (Obsidian). We shrink their degree-scaled radius so they're
      // visibly subordinate to real notes even when several links point
      // at the same missing concept.
      const r = unresolved
        ? Math.max(NODE_R_MIN * 0.6, scaleRadius(degree, maxDegree) * UNRESOLVED_RADIUS_SCALE)
        : scaleRadius(degree, maxDegree);
      return {
        id: p.id,
        x: p.x,
        y: p.y,
        r,
        degree,
        title: titleMap.get(p.id) ?? p.id,
        type: meta?.type ?? null,
        color: meta?.color ?? null,
        unresolved,
      };
    });
  }, [layout, degreeMap, titleMap, visibleGraph, graphSettings.groups]);

  const canvasEdges = useMemo<CanvasEdge[]>(() => {
    return visibleGraph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
  }, [visibleGraph]);

  // Search/type/kind filters now remove nodes and links before layout,
  // so the old Canvas-level dimming set stays empty.
  const matchedIds = useMemo<ReadonlySet<NotePath>>(() => {
    return EMPTY_SET;
  }, []);

  const neighborIds = useMemo<ReadonlySet<NotePath>>(() => {
    if (selectedId === null) return EMPTY_SET;
    const set = adjacency.get(selectedId);
    return set ?? EMPTY_SET;
  }, [selectedId, adjacency]);

  // Legend groups: the active user-defined group rules — the ONLY source
  // of node color in the monochrome model. We only legend groups that can
  // actually tint a currently-visible node, so the legend doesn't claim a
  // color that never appears.
  const legendGroups = useMemo<LegendGroup[]>(() => {
    const active = graphSettings.groups.filter((g) => g.enabled);
    if (active.length === 0) return [];
    return active
      .filter((g) =>
        visibleGraph.nodes.some(
          (n) => n.unresolved !== true && graphGroupQueryMatchesNode(n, g.query),
        ),
      )
      .map((g) => ({ id: g.id, label: g.name, color: g.color }));
  }, [graphSettings.groups, visibleGraph]);

  // Whether any unresolved phantom node is currently visible → drives the
  // gray "Non risolte" legend entry.
  const hasUnresolved = useMemo<boolean>(
    () => visibleGraph.nodes.some((n) => n.unresolved === true),
    [visibleGraph],
  );

  const legendKinds = useMemo(() => {
    if (selectedKinds.size === 0) return [];
    return Array.from(selectedKinds).sort();
  }, [selectedKinds]);

  // Clear stale selections when a vault switch brings in a new graph that
  // no longer contains the previously selected type or kinds.
  useEffect(() => {
    if (load.kind !== 'ready') return;
    const validTypes = new Set(typeChips.map((t) => t.id));
    const nextTypes = graphSettings.query.types.filter((type) => validTypes.has(type));
    if (nextTypes.length !== graphSettings.query.types.length) {
      updateGraphQuery({ types: nextTypes });
    }

    const validKinds = new Set(kindOptions);
    const nextKinds = graphSettings.query.relationKinds.filter((kind) => validKinds.has(kind));
    if (nextKinds.length !== graphSettings.query.relationKinds.length) {
      updateGraphQuery({ relationKinds: nextKinds });
    }
  }, [
    load.kind,
    typeChips,
    kindOptions,
    graphSettings.query.types,
    graphSettings.query.relationKinds,
    updateGraphQuery,
  ]);

  useEffect(() => {
    if (selectedId === null) return;
    if (!visibleGraph.nodes.some((node) => node.path === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visibleGraph]);

  // Compute fit-to-screen view. Called once when the layout is ready
  // and again whenever the user clicks the "fit" button.
  // Note: fitToScreen also serves as the "user wants to reset the camera"
  // affordance via the toolbar button, so we clear userInteractedRef here.
  // The auto-fit useEffect below distinguishes initial settle (interacted=
  // false → fit) from refetch settles (interacted=true → preserve view).
  const fitToScreen = useCallback(
    (animate = false): void => {
      if (canvasNodes.length === 0) return;
      const bounds = computeBounds(canvasNodes);
      const w = bounds.maxX - bounds.minX || 1;
      const h = bounds.maxY - bounds.minY || 1;
      const scaleX = (CANVAS_W - FIT_PADDING * 2) / w;
      const scaleY = (CANVAS_H - FIT_PADDING * 2) / h;
      const scale = Math.min(scaleX, scaleY, ZOOM_MAX);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      // Translate so the centre of the bounding box ends up at the
      // centre of the viewBox (after scaling).
      const next: CanvasView = {
        tx: CANVAS_W / 2 - cx * scale,
        ty: CANVAS_H / 2 - cy * scale,
        scale,
      };
      // Skip the glide on very large graphs (per-frame transform writes
      // get janky) and on the initial settle (animate=false).
      const instant = !animate || canvasNodes.length > GRAPH_ANIMATION_NODE_CEILING;
      animateCamera(next, { instant });
      // Explicit fit-to-screen press → re-arm the auto-fit on next layout
      // change too, so the camera tracks new layouts until the user gestures.
      userInteractedRef.current = false;
    },
    [canvasNodes, animateCamera],
  );

  // Auto-fit once the layout is ready. We fit on the FIRST settle and
  // only re-fit on subsequent layouts if the user hasn't yet panned or
  // zoomed — otherwise a watcher refetch yanks the camera away from
  // wherever the user is looking (visible bug with wheel zoom, since
  // wheel doesn't sync to React state). The "Adatta" button explicitly
  // resets `userInteractedRef` so users can return to fit-to-screen.
  const lastFitRef = useRef<unknown>(null);
  const userInteractedRef = useRef(false);
  useEffect(() => {
    if (layout === null) return;
    if (lastFitRef.current === layout) return;
    if (userInteractedRef.current) {
      // Layout changed but the user has the camera where they want it —
      // mark this layout as "seen" so we don't re-fit later either.
      lastFitRef.current = layout;
      return;
    }
    lastFitRef.current = layout;
    fitToScreen();
  }, [layout, fitToScreen]);

  // Smoothly re-center on the selected node (Obsidian-style focus). We
  // keep the live scale and just glide the pan so the node lands at the
  // viewBox centre. Only fires for a genuine selection change — clearing
  // the selection or selecting the same node again is a no-op. Skipped on
  // very large graphs by the tween's instant fallback.
  const lastFocusedRef = useRef<NotePath | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      lastFocusedRef.current = null;
      return;
    }
    if (lastFocusedRef.current === selectedId) return;
    const node = canvasNodes.find((n) => n.id === selectedId);
    if (node === undefined) return;
    lastFocusedRef.current = selectedId;
    const cur = canvasRef.current?.getView() ?? view;
    const next: CanvasView = {
      tx: CANVAS_W / 2 - node.x * cur.scale,
      ty: CANVAS_H / 2 - node.y * cur.scale,
      scale: cur.scale,
    };
    // The user is intentionally focusing — don't let a later layout
    // refetch yank the camera back to fit-to-screen.
    userInteractedRef.current = true;
    animateCamera(next, { instant: canvasNodes.length > GRAPH_ANIMATION_NODE_CEILING });
    // `view` intentionally excluded: we read the live transform via the
    // handle, and including it would re-fire focus on every pan settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, canvasNodes, animateCamera]);

  const handleZoom = useCallback(
    (factor: number): void => {
      cancelCameraTween();
      const cur = canvasRef.current?.getView() ?? view;
      const nextScale = clamp(cur.scale * factor, ZOOM_MIN, ZOOM_MAX);
      // Zoom about the centre of the viewBox so a button press feels
      // predictable (vs zooming about the cursor, which makes sense
      // for wheel events but is jarring for keyboard zoom).
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      const ratio = nextScale / cur.scale;
      const next: CanvasView = {
        tx: cx - (cx - cur.tx) * ratio,
        ty: cy - (cy - cur.ty) * ratio,
        scale: nextScale,
      };
      setView(next);
      canvasRef.current?.setView(next);
      userInteractedRef.current = true;
    },
    [view, cancelCameraTween],
  );

  // ---- Pan gesture --------------------------------------------------
  // We track the gesture entirely in refs so per-frame updates don't
  // trigger React. The only React state we touch is `panning`, which
  // flips once at gesture start and once at end to drive the cursor.
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startView: CanvasView;
  } | null>(null);

  const handleBackgroundMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Only left-button drag pans. Middle/right preserved for browser /
      // future context-menu use.
      if (e.button !== 0) return;
      if (canvasRef.current === null) return;
      // A manual drag must override any in-flight focus glide.
      cancelCameraTween();
      panStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startView: canvasRef.current.getView(),
      };
      setPanning(true);
      // Same reasoning as wheel zoom: once the user has moved the camera,
      // don't let a subsequent layout refetch fit-to-screen back over them.
      userInteractedRef.current = true;
    },
    [cancelCameraTween],
  );

  // Window-level listeners for the move + up phases of the gesture so
  // the user can drag past the SVG bounds without the pan getting
  // stuck. We attach when panning starts, detach when it ends.
  useEffect(() => {
    if (!panning) return;
    const onMove = (e: MouseEvent): void => {
      const ps = panStateRef.current;
      if (ps === null || canvasRef.current === null) return;
      // Convert pixel delta to viewBox units. The SVG stretches to the
      // container; we approximate by reading the current bounding rect.
      // It's an approximation because we don't know the rendered size
      // here — but for a fixed `viewBox` and `preserveAspectRatio`
      // the ratio is constant during a gesture, so feel is fine.
      const next: CanvasView = {
        tx: ps.startView.tx + (e.clientX - ps.startX),
        ty: ps.startView.ty + (e.clientY - ps.startY),
        scale: ps.startView.scale,
      };
      canvasRef.current.setView(next);
    };
    const onUp = (): void => {
      const handle = canvasRef.current;
      if (handle !== null) {
        // Sync React state to the final transform so re-renders driven
        // by other props (selection, search) don't snap the camera
        // back to its pre-pan position.
        setView(handle.getView());
      }
      panStateRef.current = null;
      setPanning(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panning]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      if (canvasRef.current === null) return;
      // Wheel zoom overrides any in-flight focus glide.
      cancelCameraTween();
      // We don't preventDefault here — React's synthetic wheel listener
      // is passive, so calling preventDefault would be a no-op anyway.
      // The SVG sits inside a flex container that doesn't itself scroll,
      // so the page won't accidentally scroll while the user zooms.
      const cur = canvasRef.current.getView();
      // Negative deltaY = scrolling up = zooming in. Tiny exponent so
      // trackpad pinches feel smooth instead of jumping in big steps.
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nextScale = clamp(cur.scale * factor, ZOOM_MIN, ZOOM_MAX);
      if (nextScale === cur.scale) return;
      // Zoom about the cursor: the world point under the cursor must
      // stay under the cursor after the scale change. That's the
      // standard `tx' = cx - (cx - tx) * ratio` formula in viewBox
      // space. We approximate the cursor position by the SVG's
      // boundingClientRect — exact, since the wheel event has clientX/Y.
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      // Map cursor from screen → viewBox coords. Because we use
      // preserveAspectRatio="xMidYMid meet" the actual rendered area
      // may be letterboxed; for v0.3 we assume centred fit is close
      // enough — being a few px off in the zoom anchor isn't
      // perceptible during a continuous gesture.
      const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
      const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
      const ratio = nextScale / cur.scale;
      const next: CanvasView = {
        tx: px - (px - cur.tx) * ratio,
        ty: py - (py - cur.ty) * ratio,
        scale: nextScale,
      };
      canvasRef.current.setView(next);
      userInteractedRef.current = true;
      // We do NOT setView() here on every frame — that would trigger a
      // React render per wheel tick. Instead we sync at the next
      // selection / refetch boundary. (View state is also re-synced via
      // the imperative handle's setView path when needed.) The
      // userInteractedRef flip prevents the next layout-changed effect
      // from yanking the camera back.
    },
    [cancelCameraTween],
  );

  const handleGraphFrameMouseDownCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isKeyboardInputTarget(e.target)) return;
    graphFrameRef.current?.focus({ preventScroll: true });
  }, []);

  const handleGraphKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isKeyboardInputTarget(e.target)) return;
      const cur = canvasRef.current?.getView() ?? view;
      const next = nextGraphKeyboardView(
        cur,
        { key: e.key, shiftKey: e.shiftKey },
        {
          width: CANVAS_W,
          height: CANVAS_H,
          minScale: ZOOM_MIN,
          maxScale: ZOOM_MAX,
          zoomStep: ZOOM_STEP,
        },
      );
      if (next === null) return;
      e.preventDefault();
      cancelCameraTween();
      setView(next);
      canvasRef.current?.setView(next);
      userInteractedRef.current = true;
    },
    [view, cancelCameraTween],
  );

  const handleScopeChange = useCallback(
    (scope: GraphScope): void => {
      setGraphScope(scope);
      userInteractedRef.current = false;
      if (scope === 'local') {
        const nextRoot = selectedId ?? currentPath ?? visibleGraph.nodes[0]?.path ?? null;
        setLocalRootId(nextRoot);
        if (nextRoot !== null) setSelectedId(nextRoot);
      }
    },
    [currentPath, selectedId, visibleGraph.nodes],
  );

  const handleNodeClick = useCallback(
    (id: NotePath): void => {
      // Unresolved phantom nodes are not real notes: no selection, no
      // local-root pivot. Clicking is a deliberate no-op for now (a
      // future iteration may create+open the missing note Obsidian-style).
      if (isUnresolvedId(id)) return;
      if (graphScope === 'local') {
        setLocalRootId(id);
        setSelectedId(id);
        userInteractedRef.current = false;
        return;
      }
      setSelectedId((cur) => (cur === id ? null : id));
    },
    [graphScope],
  );

  const handleNodeDoubleClick = useCallback((id: NotePath): void => {
    // No backing file for unresolved phantom nodes — opening would 404.
    // No-op until create-on-click lands.
    if (isUnresolvedId(id)) return;
    // Sync the live transform back into React state before opening
    // the editor — otherwise on next mount the canvas would snap
    // back to the last React-tracked view.
    const handle = canvasRef.current;
    if (handle !== null) setView(handle.getView());
    void navigateToNote(id);
  }, []);

  const handleBackgroundClick = useCallback((): void => {
    setSelectedId(null);
  }, []);

  const handleTypeChange = useCallback(
    (type: string | null): void => {
      updateGraphQuery({ types: type === null ? [] : [type] });
    },
    [updateGraphQuery],
  );

  const handleKindsChange = useCallback(
    (next: ReadonlySet<string>): void => {
      updateGraphQuery({ relationKinds: Array.from(next).sort() });
    },
    [updateGraphQuery],
  );

  const handleShowMentionsChange = useCallback(
    (next: boolean): void => {
      updateGraphQuery({ showMentions: next });
    },
    [updateGraphQuery],
  );

  const handleApplyPreset = useCallback(
    (preset: GraphPreset): void => {
      updateGraphQuery(preset.query);
      updateGraphDisplay(preset.display);
      updateGraphForces(preset.forces);
    },
    [updateGraphQuery, updateGraphDisplay, updateGraphForces],
  );

  const selectedNode = useMemo(
    () =>
      selectedId === null ? null : (canvasNodes.find((node) => node.id === selectedId) ?? null),
    [selectedId, canvasNodes],
  );

  const selectedConnections = useMemo<NodeConnection[]>(
    () =>
      selectedId === null
        ? []
        : visibleGraph.edges
            .filter((edge) => edge.source === selectedId || edge.target === selectedId)
            .map((edge) => {
              const outgoing = edge.source === selectedId;
              const id = outgoing ? edge.target : edge.source;
              return {
                id,
                title: titleMap.get(id) ?? id,
                kind: edge.kind === '' ? 'link' : edge.kind,
                direction: outgoing ? 'out' : 'in',
              };
            }),
    [selectedId, visibleGraph, titleMap],
  );

  const localRootTitle = useMemo(() => {
    if (localRootId === null || load.kind !== 'ready') return null;
    return load.graph.nodes.find((node) => node.path === localRootId)?.title ?? localRootId;
  }, [load, localRootId]);

  // ---- Render ------------------------------------------------------
  const isReady = load.kind === 'ready';
  const totalNodeCount = isReady ? load.graph.nodes.length : 0;
  const nodeCount = isReady ? visibleGraph.nodes.length : 0;
  const edgeCount = isReady ? visibleGraph.edges.length : 0;
  const hiddenNodeCount = graphView?.hiddenNodeCount ?? 0;
  const hiddenEdgeCount = graphView?.hiddenEdgeCount ?? 0;
  const hasActiveFilters = (graphView?.activeFilterCount ?? 0) > 0;

  return (
    <div
      className={[
        'flex h-full w-full flex-col bg-graph-bg text-graph-text',
        surfaceFullscreen ? 'fixed inset-0 z-50' : '',
      ].join(' ')}
    >
      <div
        ref={graphFrameRef}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-hidden bg-graph-bg outline-none"
        onKeyDown={handleGraphKeyDown}
        onMouseDownCapture={handleGraphFrameMouseDownCapture}
      >
        <div className="pointer-events-none absolute left-4 right-4 top-3 z-10 flex items-start justify-between gap-3">
          <div className="min-w-0 rounded-lg border border-graph-edge/90 bg-graph-surface/80 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur">
            <div className="flex min-w-0 items-baseline gap-3">
              <h1 className="truncate text-[14px] font-semibold text-graph-text">
                Grafo {graphScope === 'local' ? 'locale' : 'globale'}
              </h1>
              {isReady && (
                <span className="truncate font-mono text-[11px] tabular-nums text-graph-text-muted">
                  {nodeCount} {nodeCount === 1 ? 'nodo' : 'nodi'} · {edgeCount}{' '}
                  {edgeCount === 1 ? 'arco' : 'archi'}
                </span>
              )}
            </div>
            {graphScope === 'local' && localRootTitle !== null && (
              <p className="mt-1 truncate text-[11px] text-graph-text-muted">
                Root: {localRootTitle} · profondità {graphSettings.query.localDepth}
              </p>
            )}
            {hasActiveFilters && (
              <p className="mt-1 truncate text-[11px] text-graph-text-muted">
                {hiddenNodeCount} nodi nascosti · {hiddenEdgeCount} collegamenti nascosti
              </p>
            )}
          </div>

          <div className="pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <SegmentedControl
              ariaLabel="Ambito grafo"
              value={graphScope}
              items={GRAPH_SCOPE_ITEMS}
              onChange={handleScopeChange}
              variant="graph"
            />
            {searchOpen && (
              <label className="flex h-9 w-64 max-w-[38vw] items-center gap-2 rounded-lg border border-graph-edge bg-graph-surface/86 px-2.5 text-graph-text-muted shadow-lg shadow-black/20 backdrop-blur transition focus-within:border-graph-border-strong focus-within:ring-2 focus-within:ring-graph-selection/25">
                <MagnifyingGlass size={16} aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e): void => updateGraphQuery({ search: e.target.value })}
                  placeholder="Cerca"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-graph-text outline-none placeholder:text-graph-text-muted"
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  aria-label="Filtra nodi per titolo"
                />
              </label>
            )}
            <div className="flex h-9 items-center divide-x divide-graph-edge overflow-hidden rounded-lg border border-graph-edge bg-graph-surface/86 shadow-lg shadow-black/20 backdrop-blur">
              <IconButton
                onClick={(): void => setSearchOpen((open) => !open)}
                label={searchOpen ? 'Nascondi ricerca grafo' : 'Mostra ricerca grafo'}
                title="Cerca"
                pressed={searchOpen}
                variant="graph"
                icon={<MagnifyingGlass size={15} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => {
                  void fetchGraph();
                }}
                label="Aggiorna grafo"
                variant="graph"
                icon={<ArrowCounterClockwise size={15} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => handleZoom(1 / ZOOM_STEP)}
                label="Diminuisci zoom"
                title="Zoom out"
                variant="graph"
                icon={<Minus size={15} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => handleZoom(ZOOM_STEP)}
                label="Aumenta zoom"
                title="Zoom in"
                variant="graph"
                icon={<Plus size={15} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => fitToScreen(true)}
                label="Adatta alla finestra"
                variant="graph"
                icon={<CornersOut size={16} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => setSurfaceFullscreen((open) => !open)}
                label={surfaceFullscreen ? 'Riduci grafo' : 'Espandi grafo'}
                pressed={surfaceFullscreen}
                variant="graph"
                icon={<ArrowSquareOut size={16} aria-hidden="true" />}
              />
              <IconButton
                onClick={(): void => setSettingsOpen(true)}
                label="Apri controlli grafo"
                title="Controlli grafo"
                variant="graph"
                icon={<Gear size={16} aria-hidden="true" />}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
          <TypeChips types={typeChips} selectedType={selectedType} onChange={handleTypeChange} />
          <KindFilterDropdown
            kinds={kindOptions}
            selectedKinds={selectedKinds}
            onChange={handleKindsChange}
            hasMentions={hasMentionEdges}
            showMentions={graphSettings.query.showMentions}
            onShowMentionsChange={handleShowMentionsChange}
          />
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-graph-edge bg-graph-surface/84 px-2 text-[12px] text-graph-text-muted shadow-lg shadow-black/20 backdrop-blur transition hover:border-graph-border-strong hover:text-graph-text">
            <input
              type="checkbox"
              checked={clusterOverlayOn}
              onChange={(e): void => setClusterOverlayOn(e.target.checked)}
              className="size-3.5 accent-graph-node"
            />
            Cluster
          </label>
        </div>

        <GraphSettingsPanel
          open={settingsOpen}
          settings={graphSettings}
          onClose={(): void => setSettingsOpen(false)}
          onReset={resetGraphSettings}
          onApplyPreset={handleApplyPreset}
          onQueryChange={updateGraphQuery}
          onDisplayChange={updateGraphDisplay}
          onForcesChange={updateGraphForces}
          onAddGroup={addGraphGroup}
          onUpdateGroup={updateGraphGroup}
          onRemoveGroup={removeGraphGroup}
        />
        {load.kind === 'loading' && (
          <GraphStatus
            tone="neutral"
            title="Caricamento grafo"
            detail="Preparazione della mappa del vault."
          />
        )}
        {load.kind === 'error' && (
          <GraphStatus tone="danger" title="Impossibile caricare il grafo" detail={load.message} />
        )}
        {load.kind === 'ready' && nodeCount === 0 && (
          <GraphEmptyOverlay
            totalNodeCount={totalNodeCount}
            // The graph honours filters via the settings store; resetting
            // the whole graph settings is the real "clear filters" action.
            onResetFilters={resetGraphSettings}
          />
        )}
        {load.kind === 'ready' && nodeCount > 0 && (
          <Canvas
            ref={canvasRef}
            nodes={canvasNodes}
            edges={canvasEdges}
            width={CANVAS_W}
            height={CANVAS_H}
            initialView={view}
            selectedId={selectedId}
            matchedIds={matchedIds}
            neighborIds={neighborIds}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onBackgroundMouseDown={handleBackgroundMouseDown}
            onWheel={handleWheel}
            onBackgroundClick={handleBackgroundClick}
            panning={panning}
            clusterOverlayOn={clusterOverlayOn}
            highlightType={selectedType}
            highlightKinds={selectedKinds}
            showLinks={graphSettings.display.showLinks}
            showNodes={graphSettings.display.showNodes}
            showText={graphSettings.display.showText}
            showArrows={graphSettings.display.showArrows}
            labelFade={graphSettings.display.labelFade}
            nodeScale={graphSettings.display.nodeScale}
            linkWidth={graphSettings.display.linkWidth}
            showGrid={graphSettings.display.showGrid}
            linkOpacity={graphSettings.forces.linkOpacity}
            focusMode={graphSettings.query.focusMode}
            palette={palette}
          />
        )}
        {load.kind === 'ready' && nodeCount > 0 && (
          <Legend
            groups={legendGroups}
            hasUnresolved={hasUnresolved}
            visibleKinds={legendKinds}
            showMentions={hasMentionEdges && graphSettings.query.showMentions}
          />
        )}
        {load.kind === 'ready' && selectedNode !== null && (
          <NodeDetailPanel
            node={selectedNode}
            connections={selectedConnections}
            onSelectConnection={(id): void => {
              // Don't pivot selection onto a phantom (no backing note).
              if (isUnresolvedId(id)) return;
              setSelectedId(id);
            }}
            onOpen={(): void => {
              void navigateToNote(selectedNode.id);
            }}
            onClose={(): void => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<NotePath> = new Set<NotePath>();
const EMPTY_GRAPH: FullGraph = { nodes: [], edges: [] };

type NodeConnection = {
  id: NotePath;
  title: string;
  kind: string;
  direction: 'in' | 'out';
};

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** True for synthetic ids of unresolved (phantom) graph nodes. */
function isUnresolvedId(id: string): boolean {
  return id.startsWith(UNRESOLVED_NODE_PREFIX);
}

function isKeyboardInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, button, [role="button"], [role="textbox"]') !== null
  );
}

/**
 * Map a node's degree onto a visual radius in viewBox units. We use a
 * sqrt curve so the difference between degree-1 and degree-5 reads
 * clearly without making degree-50 hubs absurdly large.
 */
function scaleRadius(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return NODE_R_MIN;
  const t = Math.sqrt(degree) / Math.sqrt(maxDegree);
  return NODE_R_MIN + t * (NODE_R_MAX - NODE_R_MIN);
}

function groupColorForNode(
  node: { path: string; title: string; type: string | null },
  groups: ReadonlyArray<GraphGroupRule>,
): string | null {
  for (const group of groups) {
    if (!group.enabled) continue;
    if (graphGroupQueryMatchesNode(node, group.query)) return group.color;
  }
  return null;
}

function GraphStatus({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: 'neutral' | 'danger';
}): JSX.Element {
  const isDanger = tone === 'danger';
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div
        className={[
          'w-full max-w-sm rounded-lg border bg-graph-surface/92 p-5 text-center shadow-xl shadow-black/25 backdrop-blur',
          isDanger ? 'border-red-500/55' : 'border-graph-edge',
        ].join(' ')}
      >
        <div
          aria-hidden="true"
          className={[
            'mx-auto mb-4 h-24 w-48 rounded-md border',
            isDanger ? 'border-red-500/30 bg-red-500/10' : 'border-graph-edge bg-graph-bg',
          ].join(' ')}
        >
          <div className="flex h-full items-center justify-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-graph-node" />
            <span className="h-px w-12 bg-graph-edge" />
            {/* Mirrors the canvas selection accent so the placeholder reads
                as "this is the graph" in every theme. */}
            <span className="h-4 w-4 rounded-full border border-graph-selection/55 bg-graph-selection/30" />
            <span className="h-px w-10 bg-graph-edge" />
            <span className="h-2 w-2 rounded-full bg-graph-node-muted" />
          </div>
        </div>
        <h2
          className={
            isDanger
              ? 'text-sm font-semibold text-red-500 dark:text-red-400'
              : 'text-sm font-semibold text-graph-text'
          }
        >
          {title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-graph-text-muted">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Empty-state overlay for the graph surface. The graph canvas itself uses
 * hardcoded dark colors (a deliberate, theme-independent visualization
 * surface), but the empty overlay is a normal UI affordance, so it uses
 * design tokens and reads correctly in every theme — per the UX brief.
 *
 * Distinguishes a truly empty vault (no linkable notes yet) from a
 * filtered-to-nothing state, surfacing a real "Azzera filtri" action only
 * in the latter case (wired to the graph settings store's reset).
 */
function GraphEmptyOverlay({
  totalNodeCount,
  onResetFilters,
}: {
  totalNodeCount: number;
  onResetFilters: () => void;
}): JSX.Element {
  const isEmptyVault = totalNodeCount === 0;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-subtle/95 p-6 shadow-xl backdrop-blur">
        <EmptyView
          icon={
            isEmptyVault ? (
              <GraphIcon size={28} weight="duotone" />
            ) : (
              <FunnelX size={28} weight="duotone" />
            )
          }
          title={isEmptyVault ? 'Nessun nodo nel grafo' : 'Nessun risultato'}
          description={
            isEmptyVault
              ? 'Il vault non contiene ancora note collegabili. Crea note e collegale con [[wikilink]] per popolare il grafo.'
              : 'I filtri correnti nascondono tutti i nodi. Allarga la ricerca o azzera i filtri.'
          }
          // Only the filtered-to-nothing state gets a reset action; an
          // empty vault has no filters to clear.
          {...(isEmptyVault ? {} : { action: { label: 'Azzera filtri', onClick: onResetFilters } })}
        />
      </div>
    </div>
  );
}

function NodeDetailPanel({
  node,
  connections,
  onSelectConnection,
  onOpen,
  onClose,
}: {
  node: CanvasNode;
  connections: readonly NodeConnection[];
  onSelectConnection(id: NotePath): void;
  onOpen(): void;
  onClose(): void;
}): JSX.Element {
  const visibleConnections = connections.slice(0, 8);
  const hiddenConnectionCount = Math.max(0, connections.length - visibleConnections.length);

  return (
    <aside className="absolute bottom-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-graph-edge bg-graph-surface/92 p-3 text-xs text-graph-text shadow-xl shadow-black/25 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-graph-text">{node.title}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-graph-text-muted">{node.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-graph-text-muted transition hover:bg-graph-hover hover:text-graph-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-graph-selection/60"
          aria-label="Chiudi dettaglio nodo"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <NodeMetric label="Collegamenti" value={connections.length.toString()} />
        <NodeMetric label="Grado" value={node.degree.toString()} />
        <NodeMetric label="Tipo" value={node.type ?? 'Nota'} />
      </div>

      {visibleConnections.length > 0 && (
        <div className="mt-3 rounded-md border border-graph-edge bg-graph-elevated/80">
          <div className="flex h-8 items-center justify-between border-b border-graph-edge px-2">
            <span className="text-[11px] font-semibold text-graph-text">Vicini</span>
            {hiddenConnectionCount > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-graph-text-muted">
                +{hiddenConnectionCount}
              </span>
            )}
          </div>
          <div className="max-h-48 overflow-auto py-1">
            {visibleConnections.map((connection) => (
              <button
                key={`${connection.direction}-${connection.id}-${connection.kind}`}
                type="button"
                onClick={(): void => onSelectConnection(connection.id)}
                className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left transition hover:bg-graph-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-graph-selection/40"
              >
                <span
                  className={[
                    'grid h-5 w-5 shrink-0 place-items-center rounded border',
                    // Outgoing links pick up the theme selection accent (same
                    // hue as the canvas selection); incoming stay neutral.
                    connection.direction === 'out'
                      ? 'border-graph-selection/35 bg-graph-selection/10 text-graph-selection'
                      : 'border-graph-node-muted/45 bg-graph-elevated text-graph-text',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {connection.direction === 'out' ? (
                    <ArrowRight size={12} aria-hidden="true" />
                  ) : (
                    <ArrowLeft size={12} aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-graph-text">
                    {connection.title}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-graph-text-muted">
                    {connection.kind}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-graph-edge bg-graph-elevated px-3 text-xs font-medium text-graph-text transition hover:border-graph-border-strong hover:bg-graph-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-graph-selection/40"
      >
        <ArrowSquareOut size={14} aria-hidden="true" className="mr-1.5" />
        Apri nota
      </button>
    </aside>
  );
}

function NodeMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border border-graph-edge bg-graph-elevated px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-graph-text-muted">{label}</p>
      <p className="truncate text-[12px] font-medium text-graph-text">{value}</p>
    </div>
  );
}
