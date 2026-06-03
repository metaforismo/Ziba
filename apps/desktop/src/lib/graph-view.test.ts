import { describe, expect, it } from 'vitest';
import type { FullGraph } from '../../shared/ipc';
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from './graph-settings';
import { deriveGraphView } from './graph-view';

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
});
