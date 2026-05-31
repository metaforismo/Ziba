import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotePath } from '@ziba/core';
import type { FullGraph } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { debounce } from '../../lib/debounce';
import { GLOBAL_GRAPH_REFETCH_MS } from '../../lib/timings';
import { navigateToNote } from '../../lib/navigate';
import { deriveGraphView } from '../../lib/graph-view';
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
import { Legend } from './Legend';
import { useTagsStore } from '../../stores/tags';
import { useVaultStore } from '../../stores/vault';
import { useGraphSettingsStore } from '../../stores/graph';
import { GraphSettingsPanel } from './GraphSettingsPanel';
import type { GraphGroupRule } from '../../lib/graph-settings';

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
} from '../../lib/graph-tuning';

const NODE_R_MIN = 3;
const NODE_R_MAX = 18;

const ZOOM_STEP = 1.25;

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; graph: FullGraph }
  | { kind: 'error'; message: string };

export function GlobalGraph(): JSX.Element {
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [selectedId, setSelectedId] = useState<NotePath | null>(null);
  const [clusterOverlayOn, setClusterOverlayOn] = useState(false);
  // We bump `viewVersion` whenever we want to force the canvas to apply
  // a fresh `initialView` (fit-to-screen, +/- zoom button). Pan/wheel
  // gestures bypass this and write directly into the canvas via its
  // imperative handle, so they don't re-render React per frame.
  const [view, setView] = useState<CanvasView>({ tx: 0, ty: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const requestSeq = useRef(0);
  const canvasRef = useRef<CanvasHandle | null>(null);

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
  const search = graphSettings.query.search;
  const selectedType = graphSettings.query.types[0] ?? null;
  const selectedKinds = useMemo<ReadonlySet<string>>(
    () => new Set(graphSettings.query.relationKinds),
    [graphSettings.query.relationKinds],
  );
  const graphView = useMemo(
    () => (load.kind === 'ready' ? deriveGraphView(load.graph, graphSettings) : null),
    [load, graphSettings],
  );
  const visibleGraph = graphView?.graph ?? EMPTY_GRAPH;

  useEffect(() => {
    setGraphSettingsVaultRoot(currentVaultRoot);
  }, [currentVaultRoot, setGraphSettingsVaultRoot]);

  // Initial fetch + watcher-driven refetch.
  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current;
    setLoad({ kind: 'loading' });

    const fetchGraph = async (): Promise<void> => {
      try {
        const graph = await ipc.getFullGraph();
        if (cancelled || seq !== requestSeq.current) return;
        if (graph.nodes.length > LARGE_GRAPH_WARN_THRESHOLD) {
          console.warn(
            `[GlobalGraph] vault has ${graph.nodes.length} nodes; layout may be slow (v0.3 ships hand-rolled O(n²) simulation).`,
          );
        }
        setLoad({ kind: 'ready', graph });
      } catch (err: unknown) {
        if (cancelled || seq !== requestSeq.current) return;
        const message = ipcErrorMessage(err);
        setLoad({ kind: 'error', message });
      }
    };

    void fetchGraph();

    const debouncedRefetch = debounce(() => {
      // Skip if a fresh request is already in flight from the user
      // remounting the view; otherwise piggyback on the same seq.
      void (async (): Promise<void> => {
        const localSeq = ++requestSeq.current;
        try {
          const graph = await ipc.getFullGraph();
          if (cancelled || localSeq !== requestSeq.current) return;
          setLoad({ kind: 'ready', graph });
        } catch {
          // Quietly ignore refetch errors — the user already has a
          // valid graph on screen, we don't want to wipe it.
        }
      })();
    }, GLOBAL_GRAPH_REFETCH_MS);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return (): void => {
      cancelled = true;
      offEvent();
      debouncedRefetch.cancel();
    };
  }, []);

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

  // Distinct relation kinds present in the graph (empty-string sentinel excluded).
  const kindOptions = useMemo<string[]>(() => {
    if (load.kind !== 'ready') return [];
    const seen = new Set<string>();
    for (const e of load.graph.edges) {
      if (e.kind !== '') seen.add(e.kind);
    }
    return Array.from(seen).sort();
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
    const nodeMeta = new Map<NotePath, { type: string | null; color: string | null }>();
    for (const n of visibleGraph.nodes) {
      nodeMeta.set(n.path, {
        type: n.type,
        color: groupColorForNode(n, graphSettings.groups) ?? n.color,
      });
    }
    return layout.map((p) => {
      const degree = degreeMap.get(p.id) ?? 0;
      const r = scaleRadius(degree, maxDegree);
      const meta = nodeMeta.get(p.id);
      return {
        id: p.id,
        x: p.x,
        y: p.y,
        r,
        degree,
        title: titleMap.get(p.id) ?? p.id,
        type: meta?.type ?? null,
        color: meta?.color ?? null,
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

  // Legend data: when a type chip is active show only that type; otherwise all.
  const legendTypes = useMemo(() => {
    if (selectedType === null)
      return typeChips.map((t) => ({ id: t.id, label: t.label, color: t.color }));
    const active = typeChips.find((t) => t.id === selectedType);
    if (active === undefined) return [];
    return [{ id: active.id, label: active.label, color: active.color }];
  }, [typeChips, selectedType]);

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
  const fitToScreen = useCallback((): void => {
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
    setView(next);
    canvasRef.current?.setView(next);
    // Explicit fit-to-screen press → re-arm the auto-fit on next layout
    // change too, so the camera tracks new layouts until the user gestures.
    userInteractedRef.current = false;
  }, [canvasNodes]);

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

  const handleZoom = useCallback(
    (factor: number): void => {
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
    },
    [view],
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

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Only left-button drag pans. Middle/right preserved for browser /
    // future context-menu use.
    if (e.button !== 0) return;
    if (canvasRef.current === null) return;
    panStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startView: canvasRef.current.getView(),
    };
    setPanning(true);
    // Same reasoning as wheel zoom: once the user has moved the camera,
    // don't let a subsequent layout refetch fit-to-screen back over them.
    userInteractedRef.current = true;
  }, []);

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

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    if (canvasRef.current === null) return;
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
  }, []);

  const handleNodeClick = useCallback((id: NotePath): void => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const handleNodeDoubleClick = useCallback((id: NotePath): void => {
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

  const selectedNode = useMemo(
    () =>
      selectedId === null ? null : (canvasNodes.find((node) => node.id === selectedId) ?? null),
    [selectedId, canvasNodes],
  );

  const selectedConnections = useMemo(
    () =>
      selectedId === null
        ? []
        : visibleGraph.edges.filter(
            (edge) => edge.source === selectedId || edge.target === selectedId,
          ),
    [selectedId, visibleGraph],
  );

  // ---- Render ------------------------------------------------------
  const isReady = load.kind === 'ready';
  const totalNodeCount = isReady ? load.graph.nodes.length : 0;
  const nodeCount = isReady ? visibleGraph.nodes.length : 0;
  const edgeCount = isReady ? visibleGraph.edges.length : 0;
  const hiddenNodeCount = graphView?.hiddenNodeCount ?? 0;
  const hiddenEdgeCount = graphView?.hiddenEdgeCount ?? 0;
  const hasActiveFilters = (graphView?.activeFilterCount ?? 0) > 0;

  return (
    <div className="flex h-full w-full flex-col bg-bg text-fg">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border/80 bg-bg-subtle/95 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-[15px] font-semibold text-fg">Grafo globale</h1>
            {isReady && (
              <span className="truncate font-mono text-[11px] tabular-nums text-fg-muted">
                {nodeCount} {nodeCount === 1 ? 'nodo' : 'nodi'} · {edgeCount}{' '}
                {edgeCount === 1 ? 'arco' : 'archi'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              type="text"
              value={search}
              onChange={(e): void => updateGraphQuery({ search: e.target.value })}
              placeholder="Cerca nel grafo…"
              className="h-7 w-52 rounded-md border border-border/80 bg-bg px-2.5 text-xs text-fg shadow-sm outline-none transition placeholder:text-fg-muted hover:border-fg-muted/50 focus:border-accent focus:ring-2 focus:ring-accent/15"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              aria-label="Filtra nodi per titolo"
            />
            <div className="flex h-7 items-center overflow-hidden rounded-md border border-border/80 bg-bg shadow-sm">
              <button
                type="button"
                onClick={(): void => handleZoom(1 / ZOOM_STEP)}
                className={toolbarButtonClass}
                title="Zoom out"
                aria-label="Diminuisci zoom"
              >
                −
              </button>
              <button
                type="button"
                onClick={(): void => handleZoom(ZOOM_STEP)}
                className={toolbarButtonClass}
                title="Zoom in"
                aria-label="Aumenta zoom"
              >
                +
              </button>
              <button
                type="button"
                onClick={fitToScreen}
                className={`${toolbarButtonClass} border-l border-border/70 px-2.5`}
                title="Adatta alla finestra"
                aria-label="Adatta alla finestra"
              >
                Adatta
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TypeChips types={typeChips} selectedType={selectedType} onChange={handleTypeChange} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <KindFilterDropdown
              kinds={kindOptions}
              selectedKinds={selectedKinds}
              onChange={handleKindsChange}
            />
            <label className="flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-bg px-2 text-xs text-fg-subtle shadow-sm transition hover:border-fg-muted/40 hover:text-fg">
              <input
                type="checkbox"
                checked={clusterOverlayOn}
                onChange={(e): void => setClusterOverlayOn(e.target.checked)}
                className="h-3 w-3 accent-[rgb(var(--accent))]"
              />
              Mostra cluster
            </label>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        <GraphSettingsPanel
          settings={graphSettings}
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
          <GraphStatus
            tone="neutral"
            title={totalNodeCount === 0 ? 'Nessun nodo nel grafo' : 'Nessun risultato nel grafo'}
            detail={
              totalNodeCount === 0
                ? 'Il vault non contiene ancora note collegabili.'
                : 'I filtri correnti nascondono tutti i nodi. Allarga la ricerca o disattiva un filtro.'
            }
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
            linkOpacity={graphSettings.forces.linkOpacity}
            focusMode={graphSettings.query.focusMode}
          />
        )}
        {load.kind === 'ready' && nodeCount > 0 && (
          <Legend visibleTypes={legendTypes} visibleKinds={legendKinds} />
        )}
        {load.kind === 'ready' && selectedNode !== null && (
          <NodeDetailPanel
            node={selectedNode}
            edgeCount={selectedConnections.length}
            onOpen={(): void => {
              void navigateToNote(selectedNode.id);
            }}
            onClose={(): void => setSelectedId(null)}
          />
        )}
        {load.kind === 'ready' && nodeCount > 0 && hasActiveFilters && (
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-border/70 bg-bg-subtle/90 px-2.5 py-1.5 text-[11px] text-fg-muted shadow-sm backdrop-blur">
            vista filtrata · {hiddenNodeCount} nodi nascosti · {hiddenEdgeCount} collegamenti
            nascosti
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<NotePath> = new Set<NotePath>();
const EMPTY_GRAPH: FullGraph = { nodes: [], edges: [] };

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
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
    if (groupMatchesNode(node, group.query)) return group.color;
  }
  return null;
}

function groupMatchesNode(
  node: { path: string; title: string; type: string | null },
  query: string,
): boolean {
  const clauses = query
    .split(/\s+OR\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (clauses.length === 0) return false;
  return clauses.some((clause) =>
    clause
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => groupTokenMatchesNode(node, token)),
  );
}

function groupTokenMatchesNode(
  node: { path: string; title: string; type: string | null },
  token: string,
): boolean {
  if (token.startsWith('type:')) return (node.type ?? '').toLowerCase() === token.slice(5);
  if (token.startsWith('path:') || token.startsWith('folder:')) {
    const value = token.slice(token.indexOf(':') + 1);
    return node.path.toLowerCase().includes(value);
  }
  if (token.startsWith('tag:')) return false;
  return node.title.toLowerCase().includes(token) || node.path.toLowerCase().includes(token);
}

const toolbarButtonClass =
  'flex h-full min-w-7 items-center justify-center px-2 text-xs font-medium text-fg-subtle transition hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-bg-muted/80';

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
          'w-full max-w-sm rounded-lg border bg-bg-subtle/90 p-5 text-center shadow-sm backdrop-blur',
          isDanger ? 'border-red-500/40' : 'border-border/80',
        ].join(' ')}
      >
        <div
          aria-hidden="true"
          className={[
            'mx-auto mb-4 h-24 w-48 rounded-md border',
            isDanger ? 'border-red-500/25 bg-red-500/5' : 'border-border/70 bg-bg',
          ].join(' ')}
        >
          <div className="flex h-full items-center justify-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
            <span className="h-px w-12 bg-border" />
            <span className="h-4 w-4 rounded-full border border-accent/50 bg-accent/15" />
            <span className="h-px w-10 bg-border" />
            <span className="h-2 w-2 rounded-full bg-fg-muted/50" />
          </div>
        </div>
        <h2
          className={
            isDanger ? 'text-sm font-semibold text-red-500' : 'text-sm font-semibold text-fg'
          }
        >
          {title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}

function NodeDetailPanel({
  node,
  edgeCount,
  onOpen,
  onClose,
}: {
  node: CanvasNode;
  edgeCount: number;
  onOpen(): void;
  onClose(): void;
}): JSX.Element {
  return (
    <aside className="absolute bottom-3 right-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-border/80 bg-bg-subtle/95 p-3 text-xs text-fg shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{node.title}</p>
          <p className="mt-1 truncate font-mono text-[11px] text-fg-muted">{node.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-muted transition hover:bg-bg-muted hover:text-fg"
          aria-label="Chiudi dettaglio nodo"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <NodeMetric label="Collegamenti" value={edgeCount.toString()} />
        <NodeMetric label="Grado" value={node.degree.toString()} />
        <NodeMetric label="Tipo" value={node.type ?? 'Nota'} />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-3 h-8 w-full rounded-md border border-border bg-bg px-3 text-left text-xs font-medium text-fg transition hover:border-accent/60 hover:bg-bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Apri nota
      </button>
    </aside>
  );
}

function NodeMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-bg px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="truncate text-[12px] font-medium text-fg">{value}</p>
    </div>
  );
}
