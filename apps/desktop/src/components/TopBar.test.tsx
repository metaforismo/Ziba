import { fireEvent, render, screen } from '@testing-library/react';
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
  it('shows vault identity and note tabs without global navigation tabs', () => {
    render(<TopBar onChangeVault={vi.fn()} />);

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
    render(<TopBar onChangeVault={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ziba' }));

    expect(selectTab).toHaveBeenCalledWith('tab-1');
  });

  it('keeps macOS chrome draggable without covering the vault control', () => {
    render(<TopBar onChangeVault={vi.fn()} />);

    expect(screen.getByRole('banner')).toHaveClass('app-drag');
    expect(screen.getByRole('banner')).toHaveClass('pl-[86px]');
    expect(screen.getByRole('button', { name: /Cambia vault/ })).toHaveClass('app-no-drag');
    expect(screen.getByRole('button', { name: 'Ziba' })).toHaveClass('app-no-drag');
  });
});
