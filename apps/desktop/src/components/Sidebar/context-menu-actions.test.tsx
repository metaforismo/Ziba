import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NoteSummary } from '@ziba/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../../shared/ipc';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { Sidebar } from './index';

const NOTE: NoteSummary = {
  path: 'Projects/Alpha.md',
  title: 'Alpha',
  mtimeMs: 0,
};

let mock: MockController;
let copied: string[];

beforeEach(() => {
  mock = installMockIpc();
  mock.setHandler(IpcChannels.listNotes, async () => [NOTE]);
  mock.setHandler(IpcChannels.listFolders, async () => ['Projects']);
  copied = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        copied.push(text);
      }),
    },
  });
  useEditorStore.setState({
    currentPath: null,
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
  useUiStore.setState({
    mainView: 'editor',
    expandedFolders: ['Projects'],
    newNotePromptOpen: false,
  });
  useVaultStore.setState({
    current: { root: '/vault/root', name: 'root', openedAt: 0 },
    notes: [NOTE],
    folders: ['Projects'],
    typedPaths: new Map(),
  });
});

describe('Sidebar context menu file actions', () => {
  it('opens a file normally and can send it to a new tab', () => {
    const onSelectNote = vi.fn();
    const openNote = vi.fn(async () => undefined);
    useEditorStore.setState({ openNote });
    render(<Sidebar onSelectNote={onSelectNote} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apri' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apri in nuova tab' }));

    expect(onSelectNote).toHaveBeenCalledWith('Projects/Alpha.md');
    expect(openNote).toHaveBeenCalledWith('Projects/Alpha.md', {
      mode: 'new-tab',
      reuseExisting: true,
    });
  });

  it('copies relative and absolute paths from the copy path submenu', async () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Percorso relativo' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Percorso assoluto' }));

    await waitFor(() => {
      expect(copied).toEqual(['Projects/Alpha.md', '/vault/root/Projects/Alpha.md']);
    });
  });

  it('wires duplicate and show-in-Finder to real IPC channels', async () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplica' }));

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.duplicateNote)).toHaveBeenCalledWith({
        path: 'Projects/Alpha.md',
      });
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mostra in Finder' }));

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.showInFinder)).toHaveBeenCalledWith({
        path: 'Projects/Alpha.md',
      });
    });
  });
});
