import { describe, expect, it } from 'vitest';
import type { FullGraph } from '../../shared/ipc';
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from './graph-settings';
import { deriveGraphView, deriveLocalGraphView } from './graph-view';

const GRAPH: FullGraph = {
  nodes: [
    { path: 'Inbox/A.md', title: 'Alpha', type: 'note', color: null },
    { path: 'Projects/B.md', title: 'Beta', type: 'project', color: '#14b8a6' },
    { path: 'People/C.md', title: 'Carla', type: 'person', color: '#ef4444' },
    { path: 'Archive/Orphan.md', title: 'Orphan', type: null, color: null },
  ],
  edges: [
    { source: 'Inbox/A.md', target: 'Projects/B.md', targetTitle: 'Beta', kind: '' },
    { source: 'Projects/B.md', target: 'People/C.md', targetTitle: 'Carla', kind: 'owns' },
  ],
};

type GraphSettingsPatch = Partial<Omit<GraphSettings, 'query' | 'display' | 'forces'>> & {
  query?: Partial<GraphSettings['query']>;
  display?: Partial<GraphSettings['display']>;
  forces?: Partial<GraphSettings['forces']>;
};

function settings(patch: GraphSettingsPatch = {}): GraphSettings {
  return {
    ...DEFAULT_GRAPH_SETTINGS,
    ...patch,
    query: { ...DEFAULT_GRAPH_SETTINGS.query, ...patch.query },
    display: { ...DEFAULT_GRAPH_SETTINGS.display, ...patch.display },
    forces: { ...DEFAULT_GRAPH_SETTINGS.forces, ...patch.forces },
  };
}

describe('deriveGraphView', () => {
  it('removes orphan nodes when includeOrphans is false', () => {
    const view = deriveGraphView(GRAPH, settings({ query: { includeOrphans: false } }));

    expect(view.graph.nodes.map((n) => n.path)).toEqual([
      'Inbox/A.md',
      'Projects/B.md',
      'People/C.md',
    ]);
    expect(view.activeFilterCount).toBe(1);
  });

  it('applies structural search so layout is recomputed only for matching notes', () => {
    const view = deriveGraphView(GRAPH, settings({ query: { search: 'beta' } }));

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['Projects/B.md']);
    expect(view.graph.edges).toEqual([]);
    expect(view.hiddenNodeCount).toBe(3);
  });

  it('supports quoted path and OR search syntax advertised by the graph drawer', () => {
    const view = deriveGraphView(
      GRAPH,
      settings({ query: { search: 'path:"Projects" OR type:person' } }),
    );

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['Projects/B.md', 'People/C.md']);
    expect(view.graph.edges).toEqual([
      { source: 'Projects/B.md', target: 'People/C.md', targetTitle: 'Carla', kind: 'owns' },
    ]);
  });

  it('supports Obsidian-style file search in the graph search box', () => {
    const view = deriveGraphView(GRAPH, settings({ query: { search: 'file:"C"' } }));

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['People/C.md']);
    expect(view.graph.edges).toEqual([]);
  });

  it('filters by type and relation kind while preserving valid endpoints', () => {
    const view = deriveGraphView(
      GRAPH,
      settings({
        query: {
          types: ['project', 'person'],
          relationKinds: ['owns'],
        },
      }),
    );

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['Projects/B.md', 'People/C.md']);
    expect(view.graph.edges).toEqual([
      { source: 'Projects/B.md', target: 'People/C.md', targetTitle: 'Carla', kind: 'owns' },
    ]);
  });

  it('applies a minimum connection threshold', () => {
    const view = deriveGraphView(GRAPH, settings({ query: { minDegree: 2 } }));

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['Projects/B.md']);
    expect(view.graph.edges).toEqual([]);
    expect(view.activeFilterCount).toBe(1);
    expect(view.hiddenNodeCount).toBe(3);
  });
});

describe('deriveLocalGraphView', () => {
  it('derives a one-hop neighborhood from the selected note', () => {
    const view = deriveLocalGraphView(GRAPH, 'Projects/B.md', 1);

    expect(view.graph.nodes.map((n) => n.path)).toEqual([
      'Inbox/A.md',
      'Projects/B.md',
      'People/C.md',
    ]);
    expect(view.graph.edges).toEqual([
      { source: 'Inbox/A.md', target: 'Projects/B.md', targetTitle: 'Beta', kind: '' },
      { source: 'Projects/B.md', target: 'People/C.md', targetTitle: 'Carla', kind: 'owns' },
    ]);
    expect(view.hiddenNodeCount).toBe(1);
    expect(view.hiddenEdgeCount).toBe(0);
  });

  it('supports depth zero so local mode can focus on only the current note', () => {
    const view = deriveLocalGraphView(GRAPH, 'Projects/B.md', 0);

    expect(view.graph.nodes.map((n) => n.path)).toEqual(['Projects/B.md']);
    expect(view.graph.edges).toEqual([]);
    expect(view.hiddenNodeCount).toBe(3);
    expect(view.hiddenEdgeCount).toBe(2);
  });

  it('returns an empty graph when the local root is filtered out', () => {
    const view = deriveLocalGraphView(GRAPH, 'Missing.md', 2);

    expect(view.graph).toEqual({ nodes: [], edges: [] });
    expect(view.hiddenNodeCount).toBe(4);
    expect(view.hiddenEdgeCount).toBe(2);
  });
});

describe('deriveGraphView — soft references (mentions)', () => {
  const MENTION_KIND = ':mention';
  // D is connected to the graph ONLY via a mention edge. With mentions
  // shown it is not an orphan; with mentions hidden it should become one.
  const GRAPH_WITH_MENTION: FullGraph = {
    nodes: [...GRAPH.nodes, { path: 'Notes/D.md', title: 'Delta', type: null, color: null }],
    edges: [
      ...GRAPH.edges,
      { source: 'Notes/D.md', target: 'Inbox/A.md', targetTitle: 'Alpha', kind: MENTION_KIND },
    ],
  };

  it('keeps a mention-only node when mentions are shown and orphans are hidden', () => {
    const view = deriveGraphView(
      GRAPH_WITH_MENTION,
      settings({ query: { includeOrphans: false, showMentions: true } }),
    );
    expect(view.graph.nodes.map((n) => n.path)).toContain('Notes/D.md');
    expect(view.graph.edges.some((e) => e.kind === MENTION_KIND)).toBe(true);
  });

  it('demotes a mention-only node to orphan when mentions are hidden', () => {
    const view = deriveGraphView(
      GRAPH_WITH_MENTION,
      settings({ query: { includeOrphans: false, showMentions: false } }),
    );
    // The mention edge is filtered out first, so D has no edges → orphan.
    expect(view.graph.nodes.map((n) => n.path)).not.toContain('Notes/D.md');
    expect(view.graph.edges.some((e) => e.kind === MENTION_KIND)).toBe(false);
  });

  it('hides mention edges but keeps the node when it also has an explicit link', () => {
    const view = deriveGraphView(
      GRAPH_WITH_MENTION,
      settings({ query: { includeOrphans: true, showMentions: false } }),
    );
    // A is still present (explicit links), just no mention edges anywhere.
    expect(view.graph.nodes.map((n) => n.path)).toContain('Inbox/A.md');
    expect(view.graph.edges.every((e) => e.kind !== MENTION_KIND)).toBe(true);
  });
});
