import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note, NoteSummary } from '@ziba/core';
import { IpcChannels } from '../../shared/ipc';
import { installMockIpc } from '../test/mock-ipc';

function note(path: string, content = ''): Note {
  return {
    path,
    title: path.split('/').pop()?.replace(/\.md$/i, '') ?? path,
    content,
    frontmatter: {},
    wikilinks: [],
    mtimeMs: 1,
  };
}

function summary(path: string): NoteSummary {
  return {
    path,
    title: path.split('/').pop()?.replace(/\.md$/i, '') ?? path,
    mtimeMs: 1,
  };
}

async function loadStores(): Promise<{
  editor: typeof import('./editor');
  vault: typeof import('./vault');
}> {
  vi.resetModules();
  const editor = await import('./editor');
  const vault = await import('./vault');
  return { editor, vault };
}

describe('useEditorStore workspace tabs', () => {
  beforeEach(() => {
    installMockIpc({
      [IpcChannels.loadNote]: async (args: { path: string }) => note(args.path, `# ${args.path}`),
      [IpcChannels.listNotes]: async () => [],
      [IpcChannels.listFolders]: async () => [],
      [IpcChannels.getTypedPaths]: async () => [],
    });
  });

  it('opens a note by replacing the active tab and keeps legacy currentNote in sync', async () => {
    const { editor } = await loadStores();
    const { useEditorStore } = editor;

    await useEditorStore.getState().openNote('Projects/Ziba.md');

    const state = useEditorStore.getState();
    expect(state.currentPath).toBe('Projects/Ziba.md');
    expect(state.currentNote?.content).toBe('# Projects/Ziba.md');
    expect(state.workspace.panes).toHaveLength(1);
    expect(state.workspace.panes[0]?.tabIds).toHaveLength(1);
    expect(Object.values(state.workspace.tabsById)).toMatchObject([
      { path: 'Projects/Ziba.md', title: 'Ziba', dirty: false },
    ]);
  });

  it('opens a note in a new tab without losing the existing tab', async () => {
    const { editor } = await loadStores();
    const { useEditorStore } = editor;

    await useEditorStore.getState().openNote('Projects/Ziba.md');
    await useEditorStore.getState().openNote('Inbox/Idea.md', { mode: 'new-tab' });

    const state = useEditorStore.getState();
    expect(state.currentPath).toBe('Inbox/Idea.md');
    expect(state.workspace.panes[0]?.tabIds).toHaveLength(2);
    expect(Object.values(state.workspace.tabsById).map((tab) => tab.path)).toEqual([
      'Projects/Ziba.md',
      'Inbox/Idea.md',
    ]);
  });

  it('creates a second pane for split-right and selects the opened note there', async () => {
    const { editor } = await loadStores();
    const { useEditorStore } = editor;

    await useEditorStore.getState().openNote('Projects/Ziba.md');
    await useEditorStore.getState().openNote('Daily/Today.md', { mode: 'split-right' });

    const state = useEditorStore.getState();
    expect(state.workspace.panes).toHaveLength(2);
    expect(state.currentPath).toBe('Daily/Today.md');
    const activePane = state.workspace.panes.find(
      (pane) => pane.id === state.workspace.activePaneId,
    );
    expect(activePane?.tabIds).toHaveLength(1);
  });

  it('tracks dirty state per active tab and restores it when switching tabs', async () => {
    const { editor } = await loadStores();
    const { useEditorStore } = editor;

    await useEditorStore.getState().openNote('Projects/Ziba.md');
    useEditorStore.getState().setBody('draft');
    await useEditorStore.getState().openNote('Inbox/Idea.md', { mode: 'new-tab' });

    expect(useEditorStore.getState().dirty).toBe(false);

    useEditorStore.getState().selectTabByPath('Projects/Ziba.md');

    expect(useEditorStore.getState().currentPath).toBe('Projects/Ziba.md');
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useEditorStore.getState().currentNote?.content).toBe('draft');
  });
});

describe('useEditorStore openNote failure', () => {
  it('surfaces a toast and re-throws when the target note cannot be loaded', async () => {
    installMockIpc({
      [IpcChannels.loadNote]: async () => {
        throw new Error('ENOENT: file deleted');
      },
      [IpcChannels.listNotes]: async () => [],
      [IpcChannels.listFolders]: async () => [],
      [IpcChannels.getTypedPaths]: async () => [],
    });
    const { editor } = await loadStores();
    const { useEditorStore } = editor;
    const toastMod = await import('./toast');

    await expect(useEditorStore.getState().openNote('Deleted/Gone.md')).rejects.toThrow();

    const toasts = toastMod.useToastStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
    // The failed open must not leave a half-open tab behind.
    expect(Object.values(useEditorStore.getState().workspace.tabsById)).toHaveLength(0);
  });
});

describe('useEditorStore vault switch', () => {
  beforeEach(() => {
    installMockIpc({
      [IpcChannels.loadNote]: async (args: { path: string }) => note(args.path, `# ${args.path}`),
      [IpcChannels.listNotes]: async () => [],
      [IpcChannels.listFolders]: async () => [],
      [IpcChannels.getTypedPaths]: async () => [],
    });
  });

  it('clears open tabs when the vault root changes so stale notes do not survive the switch', async () => {
    const { editor, vault } = await loadStores();
    const { useEditorStore } = editor;
    const { useVaultStore } = vault;

    useVaultStore.setState({ current: { root: '/vault-a', name: 'vault-a', openedAt: 1 } });
    await useEditorStore.getState().openNote('Projects/Ziba.md');
    await useEditorStore.getState().openNote('Inbox/Idea.md', { mode: 'new-tab' });
    expect(Object.values(useEditorStore.getState().workspace.tabsById)).toHaveLength(2);

    // Switching to a different vault must drop the previous vault's tabs.
    useVaultStore.setState({ current: { root: '/vault-b', name: 'vault-b', openedAt: 2 } });

    const state = useEditorStore.getState();
    expect(Object.values(state.workspace.tabsById)).toHaveLength(0);
    expect(state.currentPath).toBeNull();
    expect(state.currentNote).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it('clears open tabs when the vault is closed', async () => {
    const { editor, vault } = await loadStores();
    const { useEditorStore } = editor;
    const { useVaultStore } = vault;

    useVaultStore.setState({ current: { root: '/vault-a', name: 'vault-a', openedAt: 1 } });
    await useEditorStore.getState().openNote('Projects/Ziba.md');
    expect(Object.values(useEditorStore.getState().workspace.tabsById)).toHaveLength(1);

    useVaultStore.setState({ current: null });

    expect(Object.values(useEditorStore.getState().workspace.tabsById)).toHaveLength(0);
    expect(useEditorStore.getState().currentPath).toBeNull();
  });
});

describe('useEditorStore createUntitledNote', () => {
  it('creates the next available Senza titolo note in the requested folder and opens it', async () => {
    const created: string[] = [];
    installMockIpc({
      [IpcChannels.createNote]: async (args: { path: string }) => {
        created.push(args.path);
        return note(args.path);
      },
      [IpcChannels.listNotes]: async () => [summary('Inbox/Senza titolo 2.md')],
      [IpcChannels.listFolders]: async () => ['Inbox'],
      [IpcChannels.getTypedPaths]: async () => [],
    });
    const { editor, vault } = await loadStores();
    const { useEditorStore } = editor;
    const { useVaultStore } = vault;
    useVaultStore.setState({
      current: { root: '/vault', name: 'vault', openedAt: 1 },
      notes: [summary('Inbox/Senza titolo.md')],
      folders: ['Inbox'],
      typedPaths: new Map(),
    });

    await useEditorStore.getState().createUntitledNote({ parentFolder: 'Inbox' });

    expect(created).toEqual(['Inbox/Senza titolo 2.md']);
    expect(useEditorStore.getState().currentPath).toBe('Inbox/Senza titolo 2.md');
    expect(useVaultStore.getState().notes).toEqual([summary('Inbox/Senza titolo 2.md')]);
  });

  it('falls back to Inbox when it exists and no parent folder is provided', async () => {
    const created: string[] = [];
    installMockIpc({
      [IpcChannels.createNote]: async (args: { path: string }) => {
        created.push(args.path);
        return note(args.path);
      },
      [IpcChannels.listNotes]: async () => [],
      [IpcChannels.listFolders]: async () => ['Inbox'],
      [IpcChannels.getTypedPaths]: async () => [],
    });
    const { editor, vault } = await loadStores();
    const { useEditorStore } = editor;
    const { useVaultStore } = vault;
    useVaultStore.setState({
      current: { root: '/vault', name: 'vault', openedAt: 1 },
      notes: [],
      folders: ['Inbox'],
      typedPaths: new Map(),
    });

    await useEditorStore.getState().createUntitledNote();

    expect(created).toEqual(['Inbox/Senza titolo.md']);
  });
});
