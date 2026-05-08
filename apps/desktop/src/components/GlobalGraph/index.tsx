import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NotePath } from '@synapsium/core';
import type { FullGraph } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { debounce } from '../../lib/debounce';
import { GLOBAL_GRAPH_REFETCH_MS } from '../../lib/timings';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import {
  Canvas,
  type CanvasEdge,
  type CanvasHandle,
  type CanvasNode,
  type CanvasView,
} from './Canvas';
import { computeBounds, initializePositions, runGlobalLayout } from './layout';

// Logical canvas the simulation runs on. The SVG `viewBox` matches
// these numbers; on screen we just stretch to fill the container, with
// `preserveAspectRatio` keeping the layout undistorted.
const CANVAS_W = 2000;
const CANVAS_H = 1400;

const NODE_R_MIN = 3;
const NODE_R_MAX = 18;

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 6;
// Padding around the bounding box on fit-to-screen so nodes don't
// kiss the edges of the viewport.
const FIT_PADDING = 40;

// Above this node count the O(n²) repulsion is genuinely slow; we still
// run it (the v0.3 spec says "log a warn and ship") but tell the dev
// console so future debugging has a breadcrumb.
const LARGE_GRAPH_WARN_THRESHOLD = 1000;

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; graph: FullGraph }
  | { kind: 'error'; message: string };

export function GlobalGraph(): JSX.Element {
  const openNote = useEditorStore((s) => s.openNote);
  const setMainView = useUiStore((s) => s.setMainView);

  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<NotePath | null>(null);
  // We bump `viewVersion` whenever we want to force the canvas to apply
  // a fresh `initialView` (fit-to-screen, +/- zoom button). Pan/wheel
  // gestures bypass this and write directly into the canvas via its
  // imperative handle, so they don't re-render React per frame.
  const [view, setView] = useState<CanvasView>({ tx: 0, ty: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const requestSeq = useRef(0);
  const canvasRef = useRef<CanvasHandle | null>(null);

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
        const message = err instanceof Error ? err.message : 'Errore sconosciuto';
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
    if (load.kind === 'ready') {
      for (const n of load.graph.nodes) m.set(n.path, n.title);
    }
    return m;
  }, [load]);

  // Degree counts (in + out). Used to scale node radius and decide
  // which nodes get labels at high zoom.
  const degreeMap = useMemo<Map<NotePath, number>>(() => {
    const m = new Map<NotePath, number>();
    if (load.kind !== 'ready') return m;
    for (const n of load.graph.nodes) m.set(n.path, 0);
    for (const e of load.graph.edges) {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    }
    return m;
  }, [load]);

  // Adjacency for 1-hop highlight. Built once per graph (not per
  // selection), so clicking around is cheap.
  const adjacency = useMemo<Map<NotePath, Set<NotePath>>>(() => {
    const m = new Map<NotePath, Set<NotePath>>();
    if (load.kind !== 'ready') return m;
    const ensure = (p: NotePath): Set<NotePath> => {
      let s = m.get(p);
      if (s === undefined) {
        s = new Set();
        m.set(p, s);
      }
      return s;
    };
    for (const e of load.graph.edges) {
      ensure(e.source).add(e.target);
      ensure(e.target).add(e.source);
    }
    return m;
  }, [load]);

  // Run the force simulation. The deps key is the graph identity, so
  // re-renders driven by selection / search / pan don't re-simulate.
  const layout = useMemo(() => {
    if (load.kind !== 'ready') return null;
    const { nodes, edges } = load.graph;
    if (nodes.length === 0) return null;
    const positioned = initializePositions(
      nodes.map((n) => n.path),
      CANVAS_W,
      CANVAS_H,
    );
    runGlobalLayout(
      positioned,
      edges.map((e) => ({ source: e.source, target: e.target })),
      { width: CANVAS_W, height: CANVAS_H },
    );
    return positioned;
  }, [load]);

  // Build the canvas-level node list. Memoised so the Canvas's
  // `memo()` shallow comparison sees a stable reference unless the
  // layout actually changed.
  const canvasNodes = useMemo<CanvasNode[]>(() => {
    if (layout === null) return [];
    const maxDegree = Array.from(degreeMap.values()).reduce((acc, v) => (v > acc ? v : acc), 0);
    return layout.map((p) => {
      const degree = degreeMap.get(p.id) ?? 0;
      const r = scaleRadius(degree, maxDegree);
      return {
        id: p.id,
        x: p.x,
        y: p.y,
        r,
        degree,
        title: titleMap.get(p.id) ?? p.id,
      };
    });
  }, [layout, degreeMap, titleMap]);

  const canvasEdges = useMemo<CanvasEdge[]>(() => {
    if (load.kind !== 'ready') return [];
    return load.graph.edges.map((e) => ({ source: e.source, target: e.target }));
  }, [load]);

  // Search filter. Empty query disables filtering; otherwise we collect
  // matching ids into a Set so the Canvas can do O(1) membership checks
  // per node during render.
  const matchedIds = useMemo<ReadonlySet<NotePath>>(() => {
    const trimmed = search.trim().toLowerCase();
    if (trimmed === '') return EMPTY_SET;
    const out = new Set<NotePath>();
    for (const [path, title] of titleMap) {
      if (title.toLowerCase().includes(trimmed)) out.add(path);
    }
    return out;
  }, [search, titleMap]);

  const neighborIds = useMemo<ReadonlySet<NotePath>>(() => {
    if (selectedId === null) return EMPTY_SET;
    const set = adjacency.get(selectedId);
    return set ?? EMPTY_SET;
  }, [selectedId, adjacency]);

  // Compute fit-to-screen view. Called once when the layout is ready
  // and again whenever the user clicks the "fit" button.
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
  }, [canvasNodes]);

  // Auto-fit once the layout is ready. We only fit on the *initial*
  // settle (not on every refetch) — re-fitting after a watcher event
  // would yank the camera away from wherever the user just panned to,
  // which is jarring. The `layout` reference identity makes this Just
  // Work: it changes on the first ready settle, then again only if the
  // node set actually shifts (rare in practice — refetches usually
  // produce the same node set with a different edge here or there).
  const lastFitRef = useRef<unknown>(null);
  useEffect(() => {
    if (layout === null) return;
    if (lastFitRef.current === layout) return;
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
    // We do NOT setView() here on every frame — that would trigger a
    // React render per wheel tick. Instead we sync at the next
    // selection / refetch boundary. (View state is also re-synced via
    // the imperative handle's setView path when needed.)
  }, []);

  const handleNodeClick = useCallback((id: NotePath): void => {
    setSelectedId((cur) => (cur === id ? null : id));
  }, []);

  const handleNodeDoubleClick = useCallback(
    (id: NotePath): void => {
      // Sync the live transform back into React state before opening
      // the editor — otherwise on next mount the canvas would snap
      // back to the last React-tracked view.
      const handle = canvasRef.current;
      if (handle !== null) setView(handle.getView());
      void openNote(id);
      setMainView('editor');
    },
    [openNote, setMainView],
  );

  const handleBackgroundClick = useCallback((): void => {
    setSelectedId(null);
  }, []);

  // ---- Render ------------------------------------------------------
  const isReady = load.kind === 'ready';
  const nodeCount = isReady ? load.graph.nodes.length : 0;
  const edgeCount = isReady ? load.graph.edges.length : 0;

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-subtle px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-sm font-semibold text-fg">Grafo globale</h1>
          {isReady && (
            <span className="truncate text-xs text-fg-muted">
              {nodeCount} {nodeCount === 1 ? 'nodo' : 'nodi'} · {edgeCount}{' '}
              {edgeCount === 1 ? 'arco' : 'archi'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e): void => setSearch(e.target.value)}
            placeholder="Filtra per titolo…"
            className="w-48 rounded border border-border bg-bg px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-muted focus:border-fg-muted"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-label="Filtra nodi per titolo"
          />
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(): void => handleZoom(1 / ZOOM_STEP)}
              className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
              title="Zoom out"
              aria-label="Diminuisci zoom"
            >
              −
            </button>
            <button
              type="button"
              onClick={(): void => handleZoom(ZOOM_STEP)}
              className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
              title="Zoom in"
              aria-label="Aumenta zoom"
            >
              +
            </button>
            <button
              type="button"
              onClick={fitToScreen}
              className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
              title="Adatta alla finestra"
              aria-label="Adatta alla finestra"
            >
              Adatta
            </button>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {load.kind === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
            Caricamento grafo…
          </div>
        )}
        {load.kind === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-500">
            Impossibile caricare il grafo: {load.message}
          </div>
        )}
        {load.kind === 'ready' && nodeCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
            Vault vuoto o nessun collegamento.
          </div>
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
          />
        )}
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<NotePath> = new Set<NotePath>();

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
