import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels, type LinkReferencesResult } from '../../../shared/ipc';
import { useEditorStore } from '../../stores/editor';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { MiniGraph } from './index';

let mock: MockController;

const realOpenNote = useEditorStore.getState().openNote;

function seedCurrentNote(wikilinks: string[] = ['Analytical Engine']): void {
  useEditorStore.setState({
    currentPath: 'People/Ada.md',
    currentNote: {
      path: 'People/Ada.md',
      title: 'Ada Lovelace',
      frontmatter: {},
      content: '',
      wikilinks,
      mtimeMs: 0,
    },
    dirty: false,
    lastSaveError: null,
  });
}

function queryNode(container: HTMLElement, id: string): Element | null {
  return container.querySelector(`[data-testid="mini-graph-node"][data-node-id="${id}"]`);
}

function queryEdge(
  container: HTMLElement,
  source: string,
  target: string,
  kind: string,
): Element | null {
  return container.querySelector(
    `[data-testid="mini-graph-edge"][data-source="${source}"][data-target="${target}"][data-edge-kind="${kind}"]`,
  );
}

beforeEach(() => {
  mock = installMockIpc();
  seedCurrentNote();
});

afterEach(() => {
  cleanup();
  useEditorStore.setState({ openNote: realOpenNote });
  vi.restoreAllMocks();
});

describe('<MiniGraph>', () => {
  it('renders backlink and mention sources from references without duplicating explicit backlinks', async () => {
    mock.setHandler(
      IpcChannels.getReferences,
      async () =>
        ({
          backlinks: [
            {
              kind: 'backlink',
              sourcePath: 'Projects/Engine.md',
              sourceTitle: 'Analytical Engine',
            },
          ],
          mentions: [
            {
              kind: 'mention',
              sourcePath: 'Letters/Mention.md',
              sourceTitle: 'A letter',
            },
            {
              kind: 'mention',
              sourcePath: 'Projects/Engine.md',
              sourceTitle: 'Analytical Engine',
            },
          ],
        }) satisfies LinkReferencesResult,
    );
    mock.setHandler(IpcChannels.resolveTitle, async (args) =>
      args.title === 'Analytical Engine' ? 'Projects/Engine.md' : null,
    );

    const { container } = render(<MiniGraph currentPath="People/Ada.md" />);

    expect(await screen.findByRole('img', { name: /grafo del vicinato/i })).toBeInTheDocument();
    expect(mock.getSpy(IpcChannels.getReferences)).toHaveBeenCalledWith({
      path: 'People/Ada.md',
    });
    expect(mock.getSpy(IpcChannels.getBacklinks)).not.toHaveBeenCalled();
    expect(mock.getSpy(IpcChannels.resolveTitle)).toHaveBeenCalledWith({
      title: 'Analytical Engine',
    });

    expect(container.querySelectorAll('[data-testid="mini-graph-node"]')).toHaveLength(3);
    expect(queryNode(container, 'People/Ada.md')).toHaveAttribute('data-node-kind', 'self');
    expect(queryNode(container, 'Projects/Engine.md')).toHaveAttribute('data-node-kind', 'inbound');
    expect(queryNode(container, 'Letters/Mention.md')).toHaveAttribute('data-node-kind', 'mention');
    expect(container.querySelectorAll('[data-node-id="Projects/Engine.md"]')).toHaveLength(1);

    const backlinkEdge = queryEdge(container, 'Projects/Engine.md', 'People/Ada.md', 'inbound');
    const mentionEdge = queryEdge(container, 'Letters/Mention.md', 'People/Ada.md', 'mention');
    const outboundEdge = queryEdge(container, 'People/Ada.md', 'Projects/Engine.md', 'outbound');

    expect(backlinkEdge).toBeInTheDocument();
    expect(backlinkEdge).toHaveAttribute('marker-end', 'url(#mini-graph-arrow-in)');
    expect(backlinkEdge).not.toHaveAttribute('stroke-dasharray');
    expect(mentionEdge).toBeInTheDocument();
    expect(mentionEdge).toHaveAttribute('stroke-dasharray', '4 3');
    expect(mentionEdge).not.toHaveAttribute('marker-end');
    expect(outboundEdge).toBeInTheDocument();
    expect(
      queryEdge(container, 'Projects/Engine.md', 'People/Ada.md', 'mention'),
    ).not.toBeInTheDocument();
  });

  it('renders mention-only references as clickable soft graph nodes', async () => {
    const openNote = vi.fn(async () => undefined);
    useEditorStore.setState({ openNote });
    seedCurrentNote([]);
    mock.setHandler(
      IpcChannels.getReferences,
      async () =>
        ({
          backlinks: [],
          mentions: [
            {
              kind: 'mention',
              sourcePath: 'Letters/Mention.md',
              sourceTitle: 'A letter',
            },
          ],
        }) satisfies LinkReferencesResult,
    );

    const { container } = render(<MiniGraph currentPath="People/Ada.md" />);

    expect(await screen.findByRole('img', { name: /grafo del vicinato/i })).toBeInTheDocument();
    const mentionNode = queryNode(container, 'Letters/Mention.md');
    expect(mentionNode).toHaveAttribute('data-node-kind', 'mention');
    expect(queryEdge(container, 'Letters/Mention.md', 'People/Ada.md', 'mention')).toHaveAttribute(
      'stroke-dasharray',
      '4 3',
    );

    fireEvent.click(mentionNode!);

    expect(openNote).toHaveBeenCalledWith('Letters/Mention.md');
  });

  it('keeps the empty state when there are no references or outbound links', async () => {
    seedCurrentNote([]);
    mock.setHandler(IpcChannels.getReferences, async () => ({ backlinks: [], mentions: [] }));

    render(<MiniGraph currentPath="People/Ada.md" />);

    expect(await screen.findByText(/Nessun collegamento/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /grafo del vicinato/i })).toBeNull();
  });
});
