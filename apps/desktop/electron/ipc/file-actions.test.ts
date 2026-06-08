import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IndexStoreAdapter, Note, NotePath } from '@ziba/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFilesystemAdapter } from '../adapters/filesystem.electron';
import { setCurrentVault, setIndexStore } from '../state';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  shell: { showItemInFolder: vi.fn() },
}));

let root: string;
let upserted: Note[] = [];

function makeIndexStore(): IndexStoreAdapter {
  return {
    init: async () => undefined,
    close: async () => undefined,
    upsertNote: async (note) => {
      upserted.push({ ...note, content: note.body ?? '' });
    },
    deleteNote: async () => undefined,
    getNote: async () => null,
    listNotes: async () => [],
    searchNotesByTitle: async () => [],
    searchFullText: async () => [],
    listTags: async () => [],
    getNotesByTag: async () => [],
    replaceTags: async () => undefined,
    getBacklinks: async () => [],
    getOutgoingWikilinks: async () => [],
    replaceWikilinks: async () => undefined,
    reresolveStaleWikilinks: async () => undefined,
    resolveTitleToPath: async () => null,
    replaceProperties: async () => undefined,
    runQuery: async () => ({ rows: [], groups: [], totalCount: 0 }),
    getFullGraph: async () => ({ nodes: [], edges: [] }),
    getMentionEdges: async () => [],
    replaceRelations: async () => undefined,
    getRelations: async () => [],
    getReverseRelations: async () => [],
    listObjectTypes: async () => [],
    getTypeCounts: async () => [],
    getTypedPaths: async () => new Map(),
    upsertObjectType: async () => undefined,
    deleteObjectType: async () => undefined,
    clear: async () => undefined,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ziba-actions-'));
  getFilesystemAdapter().setVaultRoot(root);
  setCurrentVault({ root, name: 'test', openedAt: 0 });
  setIndexStore(makeIndexStore());
  upserted = [];
});

afterEach(async () => {
  setCurrentVault(null);
  setIndexStore(null);
  getFilesystemAdapter().setVaultRoot(null);
  await rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('file actions IPC', () => {
  it('duplicates a note to the first non-clobbering copy path', async () => {
    const { duplicateNote } = await import('./file-actions');
    await writeFile(join(root, 'Alpha.md'), '# Alpha\n\nBody', 'utf8');
    await writeFile(join(root, 'Alpha copy.md'), 'existing', 'utf8');

    const note = await duplicateNote({ path: 'Alpha.md' });

    expect(note.path).toBe('Alpha copy 2.md');
    await expect(readFile(join(root, 'Alpha copy 2.md'), 'utf8')).resolves.toBe('# Alpha\n\nBody');
    expect(upserted.at(-1)?.path).toBe('Alpha copy 2.md');
  });

  it('reveals a vault-relative file or folder in Finder without escaping the vault', async () => {
    const { shell } = await import('electron');
    const { showInFinder } = await import('./file-actions');

    await showInFinder({ path: 'Alpha.md' as NotePath });

    expect(shell.showItemInFolder).toHaveBeenCalledWith(join(root, 'Alpha.md'));
    await expect(showInFinder({ path: '../outside.md' as NotePath })).rejects.toThrow(/percorso/i);
  });
});
