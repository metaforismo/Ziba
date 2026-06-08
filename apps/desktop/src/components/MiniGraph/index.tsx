import { useEffect, useMemo, useRef, useState } from 'react';
import type { NotePath } from '@ziba/core';
import { ipc } from '../../lib/ipc';
import { debounce } from '../../lib/debounce';
import { BACKLINKS_REFETCH_MS } from '../../lib/timings';
import { useEditorStore } from '../../stores/editor';
import { initializeOnCircle, simulateLayout, type LayoutEdge, type LayoutNode } from './layout';

type Props = {
  currentPath: NotePath | null;
  /** Bubbles up loading state to the parent so the active tab shows it. */
  onLoadingChange?: (loading: boolean) => void;
};

// The SVG viewBox matches the typical right-pane content area (panel
// width 280 minus a touch of horizontal padding, with a square-ish
// aspect ratio that reads well at the default size).
const VIEW_W = 280;
const VIEW_H = 320;
const NODE_R = 14;
const SELF_R = 16;
// Static layout: one settle pass at mount/refresh. We explicitly DO NOT
// run the simulation in an animation loop — for a 1-hop neighborhood the
// graph is essentially read-only, and a perpetual rAF loop is a
// well-known battery drain. 120 iterations is enough for the system to
// reach a low-energy state from the circular initialisation.
const SIM_ITERATIONS = 120;
const INITIAL_RADIUS = 80;

type SelfNode = { kind: 'self'; id: NotePath; title: string };
type InboundNode = { kind: 'inbound'; id: NotePath; title: string };
type MentionNode = { kind: 'mention'; id: NotePath; title: string };
type OutboundNode = { kind: 'outbound'; id: NotePath; title: string };
type BrokenNode = { kind: 'broken'; id: string; title: string };
type GraphNode = SelfNode | InboundNode | MentionNode | OutboundNode | BrokenNode;

type EdgeKind = 'inbound' | 'mention' | 'outbound' | 'broken';
type GraphEdge = LayoutEdge & { kind: EdgeKind };

type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selfTitle: string;
};

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], selfTitle: '' };

/**
 * Builds the 1-hop neighborhood graph for `currentPath` from:
 *  - inbound: `ipc.getReferences` backlinks (explicit links)
 *  - mentions: `ipc.getReferences` mentions (soft textual references)
 *  - outbound: `currentNote.wikilinks` resolved via `ipc.resolveTitle`
 *
 * De-duplicates nodes so each source appears once. Explicit backlinks win
 * over mention styling when a source appears in both reference sections.
 */
async function buildGraph(
  selfPath: NotePath,
  selfTitle: string,
  outboundTargets: string[],
): Promise<GraphData> {
  const [references, resolvedOutbound] = await Promise.all([
    ipc.getReferences({ path: selfPath }),
    Promise.all(
      outboundTargets.map(async (title) => ({
        title,
        path: await ipc.resolveTitle({ title }).catch(() => null),
      })),
    ),
  ]);

  const nodes: GraphNode[] = [{ kind: 'self', id: selfPath, title: selfTitle }];
  const edges: GraphEdge[] = [];

  const seen = new Set<string>([selfPath]);
  const backlinkSources = new Set<string>();

  // Inbound first so a note that's both inbound and outbound keeps the
  // inbound styling (arrow pointing AT self) — outbound just adds an edge.
  for (const b of references.backlinks) {
    if (b.sourcePath === selfPath) continue;
    backlinkSources.add(b.sourcePath);
    if (!seen.has(b.sourcePath)) {
      seen.add(b.sourcePath);
      nodes.push({ kind: 'inbound', id: b.sourcePath, title: b.sourceTitle } satisfies InboundNode);
    }
    edges.push({ source: b.sourcePath, target: selfPath, kind: 'inbound' });
  }

  for (const m of references.mentions) {
    if (m.sourcePath === selfPath || backlinkSources.has(m.sourcePath)) continue;
    if (!seen.has(m.sourcePath)) {
      seen.add(m.sourcePath);
      nodes.push({ kind: 'mention', id: m.sourcePath, title: m.sourceTitle } satisfies MentionNode);
    }
    edges.push({ source: m.sourcePath, target: selfPath, kind: 'mention' });
  }

  for (const r of resolvedOutbound) {
    if (r.path === null) {
      // Broken wikilink: synthetic id so we don't collide with a real path.
      // Title is used as the id; if the user has multiple `[[Foo]]` to the
      // same broken target we still get a single node.
      const brokenId = `broken:${r.title}`;
      if (!seen.has(brokenId)) {
        seen.add(brokenId);
        nodes.push({ kind: 'broken', id: brokenId, title: r.title } satisfies BrokenNode);
      }
      edges.push({ source: selfPath, target: brokenId, kind: 'broken' });
      continue;
    }
    if (r.path === selfPath) continue;
    if (!seen.has(r.path)) {
      seen.add(r.path);
      nodes.push({ kind: 'outbound', id: r.path, title: r.title } satisfies OutboundNode);
    }
    edges.push({ source: selfPath, target: r.path, kind: 'outbound' });
  }

  return { nodes, edges, selfTitle };
}

export function MiniGraph({ currentPath, onLoadingChange }: Props): JSX.Element {
  const currentNote = useEditorStore((s) => s.currentNote);
  const openNote = useEditorStore((s) => s.openNote);

  // The wikilink targets list is part of the note we already have in
  // memory — no need for an extra IPC. We capture it as a stable string
  // so the graph rebuild only fires when the actual link set changes,
  // not on every body keystroke.
  const outboundKey = useMemo(
    () => (currentNote?.wikilinks ?? []).join('\u0000'),
    [currentNote?.wikilinks],
  );
  const selfTitle = currentNote?.title ?? '';

  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (currentPath === null || currentNote === null) {
      setGraph(EMPTY_GRAPH);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);

    const targets = currentNote.wikilinks;
    const fetchGraph = async (): Promise<void> => {
      try {
        const next = await buildGraph(currentPath, selfTitle, targets);
        if (seq !== requestSeq.current) return;
        setGraph(next);
      } catch {
        if (seq !== requestSeq.current) return;
        setGraph(EMPTY_GRAPH);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    };

    void fetchGraph();

    // Vault watcher fires for any file change — backlinks may shift even
    // when the open note didn't change. Debounce on the same cadence as
    // the BacklinksList so the two views stay in lock-step.
    const debouncedRefetch = debounce(() => {
      void fetchGraph();
    }, BACKLINKS_REFETCH_MS);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return () => {
      offEvent();
      debouncedRefetch.cancel();
    };
    // outboundKey captures the wikilinks-set identity so we don't re-run
    // for unrelated note edits. selfTitle changes shouldn't trigger a
    // refetch (it only affects the label), but it's cheap enough to
    // include and keeps the graph label correct after a rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, outboundKey, selfTitle]);

  // Run the layout simulation whenever the node/edge identity changes.
  // useMemo is fine — the simulation is a fast, synchronous pass for the
  // sizes we care about, so we don't need the extra plumbing of an
  // effect + state.
  const positioned = useMemo<LayoutNode[]>(() => {
    if (graph.nodes.length === 0) return [];
    const initial = initializeOnCircle(
      graph.nodes.map((n) => ({ id: n.id, kind: n.kind })),
      VIEW_W,
      VIEW_H,
      INITIAL_RADIUS,
    );
    return simulateLayout(initial, graph.edges, {
      width: VIEW_W,
      height: VIEW_H,
      iterations: SIM_ITERATIONS,
    });
  }, [graph]);

  const positionMap = useMemo<Map<string, LayoutNode>>(() => {
    const m = new Map<string, LayoutNode>();
    for (const p of positioned) m.set(p.id, p);
    return m;
  }, [positioned]);

  const styledEdges = graph.edges;

  if (currentPath === null) {
    return <p className="px-3 py-2 text-xs text-fg-muted">Apri una nota per vedere il grafo.</p>;
  }
  if (graph.nodes.length <= 1) {
    return (
      <p className="px-3 py-2 text-xs text-fg-muted">
        Nessun collegamento. Aggiungi <code className="font-mono">[[wikilink]]</code> per costruire
        la rete.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden p-2">
        <svg
          data-testid="mini-graph"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-full w-full"
          role="img"
          aria-label="Grafo del vicinato della nota corrente"
        >
          <defs>
            {/* Arrow markers. Two variants so we can tint inbound vs
                outbound differently — SVG markers don't inherit
                currentColor across <use>, so we declare the tint
                explicitly via fill. */}
            <marker
              id="mini-graph-arrow-in"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--accent))" />
            </marker>
            <marker
              id="mini-graph-arrow-out"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--fg-muted))" />
            </marker>
          </defs>

          {/* Edges first, so node circles sit on top. */}
          <g>
            {styledEdges.map((e, i) => {
              const a = positionMap.get(e.source);
              const b = positionMap.get(e.target);
              if (a === undefined || b === undefined) return null;
              const isBroken = e.kind === 'broken';
              const isInbound = e.kind === 'inbound';
              const isMention = e.kind === 'mention';
              // Trim the line so it touches the circle edge, not the
              // center — otherwise the arrowhead disappears under the
              // node disc.
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const ux = dx / dist;
              const uy = dy / dist;
              const sourceR = e.source === currentPath ? SELF_R : NODE_R;
              const targetR = e.target === currentPath ? SELF_R : NODE_R;
              const x1 = a.x + ux * sourceR;
              const y1 = a.y + uy * sourceR;
              const x2 = b.x - ux * targetR;
              const y2 = b.y - uy * targetR;
              return (
                <line
                  key={`${e.source}->${e.target}-${i}`}
                  data-testid="mini-graph-edge"
                  data-mini-graph-edge-kind={e.kind}
                  data-mini-graph-edge-source={e.source}
                  data-mini-graph-edge-target={e.target}
                  data-edge-kind={e.kind}
                  data-source={e.source}
                  data-target={e.target}
                  className="graph-fade"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    isBroken
                      ? 'rgb(239 68 68 / 0.5)'
                      : isInbound
                        ? 'rgb(var(--accent))'
                        : isMention
                          ? 'rgb(var(--graph-edge-mention) / 0.85)'
                          : 'rgb(var(--fg-muted))'
                  }
                  strokeWidth={1.25}
                  strokeDasharray={isBroken ? '3 3' : isMention ? '4 3' : undefined}
                  markerEnd={
                    isBroken || isMention
                      ? undefined
                      : isInbound
                        ? 'url(#mini-graph-arrow-in)'
                        : 'url(#mini-graph-arrow-out)'
                  }
                />
              );
            })}
          </g>

          {/* Nodes. */}
          <g>
            {positioned.map((p) => {
              const node = graph.nodes.find((n) => n.id === p.id);
              if (node === undefined) return null;
              const isSelf = node.kind === 'self';
              const isBroken = node.kind === 'broken';
              const isInbound = node.kind === 'inbound';
              const isMention = node.kind === 'mention';
              const r = isSelf ? SELF_R : NODE_R;
              const fill = isSelf
                ? 'rgb(var(--accent))'
                : isBroken
                  ? 'rgb(239 68 68 / 0.12)'
                  : isInbound
                    ? 'rgb(var(--accent) / 0.15)'
                    : isMention
                      ? 'rgb(var(--bg-muted) / 0.72)'
                      : 'rgb(var(--bg-muted))';
              const stroke = isSelf
                ? 'rgb(var(--accent))'
                : isBroken
                  ? 'rgb(239 68 68 / 0.6)'
                  : isInbound
                    ? 'rgb(var(--accent))'
                    : isMention
                      ? 'rgb(var(--fg-muted) / 0.75)'
                      : 'rgb(var(--border))';
              const labelFill = isSelf ? 'rgb(var(--accent-fg))' : 'rgb(var(--fg))';
              const clickable = !isBroken;
              return (
                <g
                  key={p.id}
                  data-testid="mini-graph-node"
                  data-mini-graph-node-kind={node.kind}
                  data-mini-graph-node-id={node.id}
                  data-node-kind={node.kind}
                  data-node-id={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  className={clickable ? 'cursor-pointer' : 'cursor-default'}
                  onClick={(): void => {
                    if (!clickable) return;
                    void openNote(node.id as NotePath);
                  }}
                >
                  <title>{node.title}</title>
                  <circle
                    r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelf ? 2 : 1}
                    strokeDasharray={isBroken ? '2 2' : isMention ? '3 2' : undefined}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isSelf ? 8 : 7.5}
                    fontWeight={isSelf ? 600 : 500}
                    fill={labelFill}
                    pointerEvents="none"
                  >
                    {truncateLabel(node.title, isSelf ? 6 : 5)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] text-fg-muted">
        <span className="font-medium">self:</span>{' '}
        <span className="truncate">{graph.selfTitle}</span>
      </div>
    </div>
  );
}

/**
 * Trim a label down to a few characters so it fits inside the node disc.
 * The full title is always available via the SVG `<title>` tooltip.
 */
function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}
