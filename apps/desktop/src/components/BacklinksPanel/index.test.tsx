import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IpcChannels } from '../../../shared/ipc';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore } from '../../stores/tags';
import { useUiStore } from '../../stores/ui';
import { BacklinksPanel } from './index';

let mock: MockController;

beforeEach(() => {
  mock = installMockIpc();
  useUiStore.setState({ rightPaneTab: 'references' });
  useTagsStore.setState({ types: [], objectTypeSchemas: [] });
  useEditorStore.setState({
    currentPath: 'People/Ada.md',
    currentNote: {
      path: 'People/Ada.md',
      title: 'Ada Lovelace',
      frontmatter: {},
      content: '',
      wikilinks: [],
      mtimeMs: 0,
    },
    dirty: false,
    lastSaveError: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('BacklinksPanel', () => {
  it('renders a References tab with Backlinks and Mentions sections', async () => {
    mock.setHandler(IpcChannels.getReferences, async () => ({
      backlinks: [
        {
          kind: 'backlink' as const,
          sourcePath: 'Projects/Engine.md',
          sourceTitle: 'Analytical Engine',
          context: 'This note links to [[Ada Lovelace]].',
        },
      ],
      mentions: [
        {
          kind: 'mention' as const,
          sourcePath: 'Letters/Mention.md',
          sourceTitle: 'A letter',
          context: 'A plain-text <mark>Ada Lovelace</mark> mention.',
        },
      ],
    }));

    render(<BacklinksPanel />);

    expect(screen.getByRole('tab', { name: 'Indice' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Riferimenti' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grafo' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Oggetto' })).toBeNull();

    await waitFor(() => {
      expect(screen.getByText('Backlinks')).toBeInTheDocument();
      expect(screen.getByText('Mentions')).toBeInTheDocument();
      expect(screen.getByText('Analytical Engine')).toBeInTheDocument();
      expect(screen.getByText('A letter')).toBeInTheDocument();
    });
    expect(mock.getSpy(IpcChannels.getReferences)).toHaveBeenCalledWith({ path: 'People/Ada.md' });
  });

  it('adds the Object tab for typed notes without replacing References', () => {
    useEditorStore.setState({
      currentNote: {
        path: 'People/Ada.md',
        title: 'Ada Lovelace',
        frontmatter: { type: 'person' },
        content: '',
        wikilinks: [],
        mtimeMs: 0,
      },
    });

    render(<BacklinksPanel />);

    expect(screen.getByRole('tab', { name: 'Oggetto' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Indice' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Riferimenti' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grafo' })).toBeInTheDocument();
  });

  it('shows a single empty state and no Object tab when no note is open', () => {
    useUiStore.setState({ rightPaneTab: 'references' });
    useEditorStore.setState({ currentPath: null, currentNote: null });

    render(<BacklinksPanel />);

    // Tab bar stays usable (Outline / References / Graph), no Object tab.
    expect(screen.getByRole('tab', { name: 'Indice' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Riferimenti' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Grafo' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Oggetto' })).toBeNull();
    // One sensible pane-level empty state instead of each tab's own.
    expect(screen.getByText('Nessuna nota aperta')).toBeInTheDocument();
  });

  it('falls back to Outline when the persisted tab is Object but the note is untyped', () => {
    useUiStore.setState({ rightPaneTab: 'object' });
    useEditorStore.setState({
      currentNote: {
        path: 'People/Ada.md',
        title: 'Ada Lovelace',
        frontmatter: {}, // untyped
        content: '# Ada',
        wikilinks: [],
        mtimeMs: 0,
      },
    });

    render(<BacklinksPanel />);

    expect(screen.queryByRole('tab', { name: 'Oggetto' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Indice' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the Outline tab for the current note', () => {
    useUiStore.setState({ rightPaneTab: 'outline' });
    useEditorStore.setState({
      currentNote: {
        path: 'People/Ada.md',
        title: 'Ada Lovelace',
        frontmatter: {},
        content: '# Ada\n## Notes',
        wikilinks: [],
        mtimeMs: 0,
      },
    });

    render(<BacklinksPanel />);

    expect(screen.getByRole('tab', { name: 'Indice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Ada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notes' })).toBeInTheDocument();
  });
});
