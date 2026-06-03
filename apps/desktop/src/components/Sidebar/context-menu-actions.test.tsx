import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { NoteSummary } from '@ziba/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../../../shared/ipc';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { TreeContextMenu } from './TreeContextMenu';
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
  it('keeps only primary file actions at the top level', () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));

    const menu = screen.getByRole('menu');
    expect(menuItemNames(menu)).toEqual([
      'Apri',
      'Apri in nuova tab',
      'Rinomina',
      'Elimina',
      'Altro',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Duplica' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mostra in Finder' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Copia percorso relativo' })).toBeNull();
  });

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

  it('copies relative and absolute file paths from the Altro submenu', async () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso relativo' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso assoluto' }));

    await waitFor(() => {
      expect(copied).toEqual(['Projects/Alpha.md', '/vault/root/Projects/Alpha.md']);
    });
  });

  it('wires duplicate and show-in-Finder to real IPC channels', async () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplica' }));

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.duplicateNote)).toHaveBeenCalledWith({
        path: 'Projects/Alpha.md',
      });
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mostra in Finder' }));

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.showInFinder)).toHaveBeenCalledWith({
        path: 'Projects/Alpha.md',
      });
    });
  });
});

describe('Sidebar context menu folder actions', () => {
  it('keeps only primary folder actions at the top level', () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Projects/ }));

    const menu = screen.getByRole('menu');
    expect(menuItemNames(menu)).toEqual([
      'Nuova nota qui',
      'Nuova cartella qui',
      'Cambia icona',
      'Rinomina',
      'Elimina',
      'Altro',
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Mostra in Finder' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Copia percorso relativo' })).toBeNull();
  });

  it('copies folder paths and shows the folder in Finder from the Altro submenu', async () => {
    render(<Sidebar />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Projects/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso relativo' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /Projects/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copia percorso assoluto' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /Projects/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mostra in Finder' }));

    await waitFor(() => {
      expect(copied).toEqual(['Projects', '/vault/root/Projects']);
      expect(mock.getSpy(IpcChannels.showInFinder)).toHaveBeenCalledWith({ path: 'Projects' });
    });
  });
});

describe('TreeContextMenu submenus', () => {
  it('renders child actions in a side submenu that flips inside the viewport', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 220 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function rectForTest(this: HTMLElement): DOMRect {
        const text = this.textContent ?? '';
        if (this.getAttribute('role') === 'menu' && text.includes('Copia percorso relativo')) {
          return rect({ left: 0, top: 0, width: 150, height: 96 });
        }
        if (this.getAttribute('role') === 'menu') {
          return rect({ left: 156, top: 18, width: 180, height: 128 });
        }
        if (text.includes('Altro')) {
          return rect({ left: 160, top: 52, width: 172, height: 28 });
        }
        return rect({ left: 0, top: 0, width: 0, height: 0 });
      });

    try {
      render(
        <TreeContextMenu
          x={156}
          y={18}
          onClose={vi.fn()}
          items={[
            { label: 'Apri', onSelect: vi.fn() },
            {
              label: 'Altro',
              children: [{ label: 'Copia percorso relativo', onSelect: vi.fn() }],
            },
          ]}
        />,
      );

      fireEvent.click(screen.getByRole('menuitem', { name: 'Altro' }));

      const menus = await screen.findAllByRole('menu');
      const submenu = menus.find((candidate) =>
        candidate.textContent?.includes('Copia percorso relativo'),
      );
      expect(submenu).toBeDefined();
      await waitFor(() => {
        expect(Number.parseFloat(submenu?.style.left ?? 'NaN')).toBeLessThan(160);
      });
      expect(submenu).toHaveClass('fixed');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });
});

function menuItemNames(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.replace('>', '').trim() ?? '');
}

function rect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}
