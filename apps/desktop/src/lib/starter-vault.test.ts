import type { NoteSummary } from '@ziba/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { IpcChannels } from '../../shared/ipc';
import { installMockIpc, type MockController } from '../test/mock-ipc';
import { useEditorStore } from '../stores/editor';
import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';
import { createStarterVault, STARTER_NOTE_PATH } from './starter-vault';

let mock: MockController;
const createdNotes: NoteSummary[] = [];
const createdFolders: string[] = [];

beforeEach(() => {
  createdNotes.length = 0;
  createdFolders.length = 0;
  window.localStorage.clear();
  mock = installMockIpc({
    [IpcChannels.createFolder]: async (args) => {
      createdFolders.push(args.path);
    },
    [IpcChannels.createNote]: async (args) => {
      createdNotes.push({
        path: args.path,
        title: args.path.split('/').pop()?.replace(/\.md$/, '') ?? args.path,
        mtimeMs: 0,
      });
      return {
        path: args.path,
        title: args.path.split('/').pop()?.replace(/\.md$/, '') ?? args.path,
        frontmatter: {},
        content: args.initialBody ?? '',
        wikilinks: [],
        mtimeMs: 0,
      };
    },
    [IpcChannels.listFolders]: async () => createdFolders,
    [IpcChannels.listNotes]: async () => createdNotes,
    [IpcChannels.loadNote]: async (args) => ({
      path: args.path,
      title: args.path === STARTER_NOTE_PATH ? 'Ziba' : 'Untitled',
      frontmatter: {},
      content: '',
      wikilinks: [],
      mtimeMs: 0,
    }),
  });
  useVaultStore.setState({
    current: { root: '/test', name: 'test', openedAt: 0 },
    notes: [],
    folders: [],
    typedPaths: new Map(),
  });
  useUiStore.setState({
    mainView: 'database',
    expandedFolders: [],
    folderIconsByVault: {},
  });
  useEditorStore.setState({
    currentPath: null,
    currentNote: null,
    dirty: false,
    lastSaveError: null,
  });
});

describe('createStarterVault', () => {
  it('creates the default folders, welcome notes, icons, and opens Ziba.md', async () => {
    await createStarterVault();

    expect(mock.getCallsFor(IpcChannels.createFolder).map(([args]) => args.path)).toEqual([
      'Inbox',
      'Daily',
      'Projects',
      'Books',
      'People',
    ]);
    expect(mock.getCallsFor(IpcChannels.createNote).map(([args]) => args.path)).toEqual([
      STARTER_NOTE_PATH,
      'Projects/Roadmap.md',
      'Projects/Idee di prodotto.md',
    ]);
    expect(mock.getCallsFor(IpcChannels.createNote)[0]?.[0].initialBody).toContain(
      'Ziba è il mio spazio per catturare idee',
    );
    expect(useUiStore.getState().mainView).toBe('editor');
    expect(useUiStore.getState().expandedFolders).toEqual(['Projects']);
    expect(useUiStore.getState().folderIconsByVault['/test']).toMatchObject({
      Inbox: 'archive',
      Daily: 'star',
      Projects: 'briefcase',
      Books: 'book',
    });
    expect(useEditorStore.getState().currentPath).toBe(STARTER_NOTE_PATH);
  });

  it('is idempotent when the starter folders or notes already exist', async () => {
    const alreadyExists = Object.assign(new Error('[ALREADY_EXISTS] exists'), {
      code: 'ALREADY_EXISTS',
    });
    mock.setHandler(IpcChannels.createFolder, async () => {
      throw alreadyExists;
    });
    mock.setHandler(IpcChannels.createNote, async () => {
      throw alreadyExists;
    });

    await expect(createStarterVault()).resolves.toBeUndefined();
    expect(useEditorStore.getState().currentPath).toBe(STARTER_NOTE_PATH);
  });

  it('surfaces non-idempotent creation errors', async () => {
    mock.setHandler(IpcChannels.createFolder, async () => {
      throw Object.assign(new Error('[PERMISSION_DENIED] denied'), {
        code: 'PERMISSION_DENIED',
      });
    });

    await expect(createStarterVault()).rejects.toThrow(/denied/i);
  });
});
