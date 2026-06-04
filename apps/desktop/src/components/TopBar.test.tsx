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
    expect(screen.getByRole('button', { name: 'Ziba' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerca' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Editor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Database/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Grafo/i })).not.toBeInTheDocument();
  });

  it('selects a note tab', () => {
    const selectTab = vi.fn();
    useEditorStore.setState({ selectTab });
    renderTopBar();

    fireEvent.click(screen.getByRole('button', { name: 'Ziba' }));

    expect(selectTab).toHaveBeenCalledWith('tab-1');
  });

  it('keeps macOS chrome draggable without covering the vault control', () => {
    renderTopBar();

    expect(screen.getByRole('banner')).toHaveClass('app-drag');
    expect(screen.getByRole('banner')).toHaveClass('pl-[86px]');
    expect(screen.getByRole('button', { name: /Cambia vault/ })).toHaveClass('app-no-drag');
    expect(screen.getByRole('button', { name: 'Ziba' })).toHaveClass('app-no-drag');
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
