import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileTree } from './FileTree';

describe('FileTree', () => {
  it('renders the custom folder icon label for a folder row', () => {
    render(
      <FileTree
        rows={[{ kind: 'folder', path: 'projects', name: 'Projects', depth: 0, expanded: false }]}
        currentPath={null}
        focusedPath={null}
        folderIcons={{ projects: 'briefcase' }}
        onToggleFolder={vi.fn()}
        onSelectFile={vi.fn()}
        onContextMenu={vi.fn()}
        onFocusPath={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Icona cartella: valigetta')).toBeInTheDocument();
  });

  it('opens folder context menus from a folder row', () => {
    const onContextMenu = vi.fn();
    render(
      <FileTree
        rows={[{ kind: 'folder', path: 'projects', name: 'Projects', depth: 0, expanded: false }]}
        currentPath={null}
        focusedPath={null}
        folderIcons={{}}
        onToggleFolder={vi.fn()}
        onSelectFile={vi.fn()}
        onContextMenu={onContextMenu}
        onFocusPath={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: /Projects/i }), {
      clientX: 12,
      clientY: 34,
    });

    expect(onContextMenu).toHaveBeenCalledWith(
      { kind: 'folder', path: 'projects', name: 'Projects' },
      12,
      34,
    );
  });

  it('renders a starter tree preview that still opens the empty-area context menu', () => {
    const onContextMenu = vi.fn();
    const onCreateStarter = vi.fn();
    render(
      <FileTree
        rows={[]}
        currentPath={null}
        focusedPath={null}
        folderIcons={{}}
        onCreateStarter={onCreateStarter}
        onToggleFolder={vi.fn()}
        onSelectFile={vi.fn()}
        onContextMenu={onContextMenu}
        onFocusPath={vi.fn()}
      />,
    );

    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Ziba.md')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crea struttura iniziale' }));
    expect(onCreateStarter).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(screen.getByText('Projects'), {
      clientX: 20,
      clientY: 40,
    });

    expect(onContextMenu).toHaveBeenCalledWith({ kind: 'empty' }, 20, 40);
  });
});
