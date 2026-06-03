import { fireEvent, render, screen } from '@testing-library/react';
import type { NoteSummary } from '@ziba/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../../shared/ipc';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useSearchStore } from '../../stores/search';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { Sidebar } from './index';

const NOTE: NoteSummary = {
  path: 'alpha.md',
  title: 'Alpha',
  mtimeMs: 0,
};

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
  useEditorStore.setState({
    currentPath: null,
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
  useUiStore.setState({
    mainView: 'editor',
    expandedFolders: [],
    newNotePromptOpen: false,
  });
  useSearchStore.setState({ open: false, query: '', results: [], selectedIndex: 0 });
  useVaultStore.setState({
    current: { root: '/test', name: 'test', openedAt: 0 },
    notes: [],
    folders: [],
    typedPaths: new Map(),
  });
});

describe('Sidebar navigation', () => {
  it('switches back to the editor immediately when selecting a note from another main view', () => {
    mock.setHandler(
      IpcChannels.loadNote,
      () =>
        new Promise(() => {
          // Keep note loading pending so the assertion proves navigation is
          // synchronous with selection, not an effect of a completed load.
        }),
    );
    useVaultStore.setState({ notes: [NOTE] });
    useUiStore.getState().setMainView('database');

    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));

    expect(useUiStore.getState().mainView).toBe('editor');
  });

  it('keeps keyboard navigation selecting notes from the tree', () => {
    const onSelectNote = vi.fn();
    useVaultStore.setState({ notes: [NOTE] });

    render(<Sidebar onSelectNote={onSelectNote} />);
    const sidebar = screen.getByLabelText('Esplora vault');

    fireEvent.keyDown(sidebar, { key: 'ArrowDown' });
    fireEvent.keyDown(sidebar, { key: 'Enter' });

    expect(onSelectNote).toHaveBeenCalledWith('alpha.md');
  });

  it('keeps database and graph as secondary tools in the sidebar', () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Grafo' }));
    expect(useUiStore.getState().mainView).toBe('graph');

    fireEvent.click(screen.getByRole('button', { name: 'Database' }));
    expect(useUiStore.getState().mainView).toBe('database');
  });

  it('opens organization sections only from the Organizza tool', () => {
    render(<Sidebar />);

    expect(screen.queryByLabelText('Tipi')).toBeNull();
    expect(screen.queryByLabelText('Tag')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Organizza' }));

    expect(screen.getByLabelText('Tipi')).toBeInTheDocument();
    expect(screen.getByLabelText('Tag')).toBeInTheDocument();
  });

  it('opens search from the sidebar search control', () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerca note' }));

    expect(useSearchStore.getState().open).toBe(true);
  });

  it('uses compact icon actions in the notes header', () => {
    render(<Sidebar />);

    expect(screen.getByRole('button', { name: 'Nuova nota' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerca note' })).toBeInTheDocument();
    expect(screen.queryByText('Cerca note...')).toBeNull();
  });
});
