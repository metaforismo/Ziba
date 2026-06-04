import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockIpc } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { Editor } from './index';

beforeEach(() => {
  installMockIpc();
  useVaultStore.setState({
    current: { root: '/vault', name: 'vault', openedAt: 0 },
    notes: [],
    folders: [],
    typedPaths: new Map(),
  });
  useEditorStore.setState({
    currentPath: 'Projects/Ziba.md',
    currentNote: {
      path: 'Projects/Ziba.md',
      title: 'Ziba',
      frontmatter: {},
      content: '# Ziba',
      wikilinks: [],
      mtimeMs: 0,
    },
    dirty: false,
    lastSaveError: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<Editor>', () => {
  it('fills the available workspace when the right panel is closed', () => {
    useUiStore.setState({ backlinksOpen: false });

    const { container } = render(<Editor />);

    expect(container.querySelector('.ziba-editor-root')).toHaveClass('w-full', 'flex-1');
    expect(container.querySelector('.ziba-editor-scroll')).toHaveClass('min-w-0', 'flex-1');
    expect(container.querySelector('.ziba-editor-content')).toHaveClass('max-w-none');
    expect(container.querySelector('.ziba-editor-content')).not.toHaveClass('max-w-[760px]');
  });

  it('uses readable width when the right panel is open', () => {
    useUiStore.setState({ backlinksOpen: true });

    const { container } = render(<Editor />);

    expect(container.querySelector('.ziba-editor-content')).toHaveClass('mx-auto', 'max-w-[760px]');
  });
});
