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

    expect(screen.getByRole('button', { name: 'Globale' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Locale' }));

    await waitFor(() => {
      expect(screen.getByText('Grafo locale')).toBeInTheDocument();
      expect(screen.getByText(/Root: Beta/)).toBeInTheDocument();
      expect(screen.getByText(/3 nodi/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Locale' })).toHaveAttribute('aria-pressed', 'true');
  });
});
