import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';
import { useEditorStore } from '../stores/editor';
import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

beforeEach(() => {
  window.localStorage.clear();
  useVaultStore.setState({
    current: { root: '/vaults/secondbrain1', name: 'secondbrain1', openedAt: 0 },
    indexProgress: null,
  });
  useUiStore.setState({ mainView: 'editor', backlinksOpen: false });
  useEditorStore.setState({
    workspace: {
      panes: [{ id: 'pane-1', tabIds: ['tab-1'], activeTabId: 'tab-1' }],
      tabsById: {
        'tab-1': {
          id: 'tab-1',
          path: 'Projects/Ziba.md',
          title: 'Ziba',
          note: null,
          dirty: false,
          loading: false,
          lastSaveError: null,
        },
      },
      activePaneId: 'pane-1',
    },
    currentPath: 'Projects/Ziba.md',
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
});

describe('TopBar', () => {
  const renderTopBar = (props: Partial<ComponentProps<typeof TopBar>> = {}) =>
    render(<TopBar sidebarWidth={320} onChangeVault={vi.fn()} {...props} />);

  it('shows vault identity and note tabs without global navigation tabs', () => {
    renderTopBar();

    expect(screen.getByText('secondbrain1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ziba' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerca' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Editor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Database/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Grafo/i })).not.toBeInTheDocument();
  });

  it('selects a note tab', () => {
    const selectTab = vi.fn();
    useEditorStore.setState({ selectTab });
    renderTopBar();

    fireEvent.click(screen.getByRole('tab', { name: 'Ziba' }));

    expect(selectTab).toHaveBeenCalledWith('tab-1');
  });

  it('keeps macOS chrome draggable without covering the vault control', () => {
    renderTopBar();

    expect(screen.getByRole('banner')).toHaveClass('app-drag');
    expect(screen.getByRole('banner')).toHaveClass('pl-[86px]');
    expect(screen.getByRole('button', { name: /Cambia vault/ })).toHaveClass('app-no-drag');
    expect(screen.getByRole('tab', { name: 'Ziba' })).toHaveClass('app-no-drag');
  });

  it('closes a clean tab immediately', () => {
    const closeTab = vi.fn();
    useEditorStore.setState({ closeTab });
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi Ziba' }));

    expect(closeTab).toHaveBeenCalledWith('tab-1');
  });

  it('confirms before closing a tab with unsaved changes', () => {
    const closeTab = vi.fn();
    useEditorStore.setState({ closeTab });
    useEditorStore.setState((state) => ({
      workspace: {
        ...state.workspace,
        tabsById: {
          'tab-1': { ...state.workspace.tabsById['tab-1']!, dirty: true },
        },
      },
    }));
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi Ziba' }));
    // Dirty close is deferred to the confirm dialog, not fired immediately.
    expect(closeTab).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi senza salvare' }));
    expect(closeTab).toHaveBeenCalledWith('tab-1');
  });

  it('disambiguates duplicate tab titles by parent folder', () => {
    useEditorStore.setState((state) => ({
      workspace: {
        panes: [{ id: 'pane-1', tabIds: ['tab-1', 'tab-2'], activeTabId: 'tab-1' }],
        activePaneId: 'pane-1',
        tabsById: {
          'tab-1': {
            ...state.workspace.tabsById['tab-1']!,
            path: 'Projects/Index.md',
            title: 'Index',
          },
          'tab-2': {
            ...state.workspace.tabsById['tab-1']!,
            id: 'tab-2',
            path: 'Inbox/Index.md',
            title: 'Index',
          },
        },
      },
    }));
    renderTopBar();

    expect(screen.getByRole('tab', { name: 'Index — Projects' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Index — Inbox' })).toBeInTheDocument();
  });

  describe('keyboard navigation', () => {
    const renderThreeTabs = (): void => {
      const base = useEditorStore.getState().workspace.tabsById['tab-1']!;
      useEditorStore.setState({
        workspace: {
          panes: [{ id: 'pane-1', tabIds: ['tab-1', 'tab-2', 'tab-3'], activeTabId: 'tab-1' }],
          activePaneId: 'pane-1',
          tabsById: {
            'tab-1': { ...base, id: 'tab-1', path: 'A.md', title: 'A' },
            'tab-2': { ...base, id: 'tab-2', path: 'B.md', title: 'B' },
            'tab-3': { ...base, id: 'tab-3', path: 'C.md', title: 'C' },
          },
        },
      });
    };

    const tab = (name: string): HTMLElement => screen.getByRole('tab', { name });

    it('moves focus with ArrowRight/ArrowLeft and wraps around', () => {
      renderThreeTabs();
      renderTopBar();
      const a = tab('A');
      const b = tab('B');
      const c = tab('C');

      a.focus();
      fireEvent.keyDown(a, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(b);

      fireEvent.keyDown(b, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(c);

      // Wraps past the last tab back to the first.
      fireEvent.keyDown(c, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(a);

      // ArrowLeft wraps from the first back to the last.
      fireEvent.keyDown(a, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(c);
    });

    it('jumps to first/last with Home/End', () => {
      renderThreeTabs();
      renderTopBar();
      const a = tab('A');
      const b = tab('B');
      const c = tab('C');

      b.focus();
      fireEvent.keyDown(b, { key: 'End' });
      expect(document.activeElement).toBe(c);

      fireEvent.keyDown(c, { key: 'Home' });
      expect(document.activeElement).toBe(a);
    });

    it('activates the focused tab with Enter without arrowing selecting it', () => {
      const selectTab = vi.fn();
      renderThreeTabs();
      useEditorStore.setState({ selectTab });
      renderTopBar();
      const a = tab('A');
      const b = tab('B');

      a.focus();
      // Arrowing moves focus only — it must NOT select the note.
      fireEvent.keyDown(a, { key: 'ArrowRight' });
      expect(selectTab).not.toHaveBeenCalled();

      // Enter on the focused tab activates it.
      fireEvent.keyDown(b, { key: 'Enter' });
      expect(selectTab).toHaveBeenCalledWith('tab-2');
    });
  });

  it('aligns the vault cell divider with the sidebar divider below', () => {
    renderTopBar({ sidebarWidth: 284 });

    expect(screen.getByRole('button', { name: /Cambia vault/ }).parentElement).toHaveStyle({
      width: '246px',
    });
  });

  it('only shows the right-panel toggle in the editor view', () => {
    const { rerender } = renderTopBar();

    expect(screen.getByRole('button', { name: 'Mostra pannello destro' })).toBeInTheDocument();

    useUiStore.setState({ mainView: 'database' });
    rerender(<TopBar sidebarWidth={320} onChangeVault={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /pannello destro/i })).toBeNull();
  });
});
