import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { IpcChannels } from '../../../shared/ipc';
import { DEFAULT_GRAPH_SETTINGS } from '../../lib/graph-settings';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useGraphSettingsStore } from '../../stores/graph';
import { useTagsStore } from '../../stores/tags';
import { useVaultStore } from '../../stores/vault';
import { GlobalGraph } from './index';

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
  mock.setHandler(IpcChannels.getFullGraph, async () => ({
    nodes: [
      { path: 'Inbox/A.md', title: 'Alpha', type: null, color: null },
      { path: 'Projects/B.md', title: 'Beta', type: 'project', color: '#14b8a6' },
      { path: 'People/C.md', title: 'Carla', type: 'person', color: '#ef4444' },
      { path: 'Archive/Orphan.md', title: 'Orphan', type: null, color: null },
    ],
    edges: [
      { source: 'Inbox/A.md', target: 'Projects/B.md', targetTitle: 'Beta', kind: '' },
      { source: 'Projects/B.md', target: 'People/C.md', targetTitle: 'Carla', kind: 'owns' },
    ],
  }));
  window.localStorage.clear();
  useVaultStore.setState({
    current: { root: '/vault-a', name: 'vault-a', openedAt: 1 },
  });
  useTagsStore.setState({ types: [], objectTypeSchemas: [] });
  useGraphSettingsStore.setState({
    vaultRoot: null,
    settings: {
      ...DEFAULT_GRAPH_SETTINGS,
      query: { ...DEFAULT_GRAPH_SETTINGS.query },
      display: { ...DEFAULT_GRAPH_SETTINGS.display },
      forces: { ...DEFAULT_GRAPH_SETTINGS.forces },
      groups: [],
    },
  });
  useEditorStore.setState({
    currentPath: 'Projects/B.md',
    currentNote: {
      path: 'Projects/B.md',
      title: 'Beta',
      frontmatter: {},
      content: '',
      wikilinks: [],
      mtimeMs: 0,
    },
    dirty: false,
    lastSaveError: null,
  });
});

describe('<GlobalGraph>', () => {
  it('switches from global to local mode using the current note as root', async () => {
    render(<GlobalGraph />);

    await waitFor(() => {
      expect(screen.getByText('Grafo globale')).toBeInTheDocument();
      expect(screen.getByText(/4 nodi/)).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: 'Globale' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Locale' }));

    await waitFor(() => {
      expect(screen.getByText('Grafo locale')).toBeInTheDocument();
      expect(screen.getByText(/Root: Beta/)).toBeInTheDocument();
      expect(screen.getByText(/3 nodi/)).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Locale' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does NOT tint a node from its type-schema color (monochrome default)', async () => {
    const { container } = render(<GlobalGraph />);
    await waitFor(() => expect(screen.getByText(/4 nodi/)).toBeInTheDocument());

    // Beta carries a type-schema color (#14b8a6) on the wire, but the
    // monochrome model must NOT use it to tint the node.
    const beta = container.querySelector('[data-graph-node="Projects/B.md"] circle');
    expect(beta).not.toBeNull();
    expect(beta?.getAttribute('fill')).not.toBe('#14b8a6');
  });

  it('tints a node ONLY from a matching user-defined group rule', async () => {
    useGraphSettingsStore.setState((prev) => ({
      ...prev,
      // Match the mounted vault root so the component's setVaultRoot effect
      // bails instead of reloading (and re-seeding) persisted settings,
      // which would clobber the group we set here.
      vaultRoot: '/vault-a',
      settings: {
        ...prev.settings,
        // groupsSeeded: true keeps the auto folder-group seeding from
        // injecting competing groups, isolating this assertion to our rule.
        groupsSeeded: true,
        groups: [
          { id: 'g1', name: 'Progetti', query: 'path:Projects', color: '#abcdef', enabled: true },
        ],
      },
    }));

    const { container } = render(<GlobalGraph />);
    await waitFor(() => expect(screen.getByText(/4 nodi/)).toBeInTheDocument());

    // Beta is in Projects/ → group color applies.
    const beta = container.querySelector('[data-graph-node="Projects/B.md"] circle');
    expect(beta?.getAttribute('fill')).toBe('#abcdef');
    // Alpha is NOT in Projects/ → stays the structural (non-group) fill.
    const alpha = container.querySelector('[data-graph-node="Inbox/A.md"] circle');
    expect(alpha?.getAttribute('fill')).not.toBe('#abcdef');
  });
});

describe('<GlobalGraph> — unresolved phantom nodes', () => {
  beforeEach(() => {
    mock.setHandler(IpcChannels.getFullGraph, async () => ({
      nodes: [
        { path: 'Inbox/A.md', title: 'Alpha', type: null, color: null },
        // Synthetic unresolved node, as produced by the IPC layer's
        // mergeUnresolvedNodes for a broken [[Missing]] wikilink.
        {
          path: 'unresolved:missing',
          title: 'Missing',
          type: null,
          color: null,
          unresolved: true,
        },
      ],
      edges: [
        {
          source: 'Inbox/A.md',
          target: 'unresolved:missing',
          targetTitle: 'Missing',
          kind: '',
        },
      ],
    }));
  });

  it('renders the phantom node flagged as unresolved (gray, non-interactive)', async () => {
    const { container } = render(<GlobalGraph />);
    await waitFor(() => expect(screen.getByText(/2 nodi/)).toBeInTheDocument());

    const phantom = container.querySelector('[data-graph-node="unresolved:missing"]');
    expect(phantom).not.toBeNull();
    expect(phantom?.getAttribute('data-graph-node-unresolved')).toBe('true');

    const real = container.querySelector('[data-graph-node="Inbox/A.md"]');
    expect(real?.getAttribute('data-graph-node-unresolved')).toBeNull();
  });
});
