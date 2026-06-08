import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FullTextHit, IndexStoreAdapter, NotePath } from '@ziba/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFilesystemAdapter } from '../adapters/filesystem.electron';
import { setCurrentVault, setIndexStore } from '../state';

let root: string;
let ftsHits: FullTextHit[];

function makeIndexStore(): IndexStoreAdapter & {
  getBacklinksWithSourceTitle(
    targetPath: NotePath,
  ): Array<{ sourcePath: NotePath; targetTitle: string; sourceTitle: string }>;
} {
  return {
    init: async () => undefined,
    close: async () => undefined,
    upsertNote: async () => undefined,
    deleteNote: async () => undefined,
    getNote: async (path) =>
      path === 'People/Ada.md'
        ? { path, title: 'Ada Lovelace', mtimeMs: 0 }
        : { path, title: path.replace(/\.md$/, ''), mtimeMs: 0 },
    listNotes: async () => [],
    searchNotesByTitle: async () => [],
    searchFullText: async () => ftsHits,
    listTags: async () => [],
    getNotesByTag: async () => [],
    replaceTags: async () => undefined,
    getBacklinks: async () => [{ sourcePath: 'Projects/Engine.md', targetTitle: 'Ada Lovelace' }],
    getBacklinksWithSourceTitle: () => [
      {
        sourcePath: 'Projects/Engine.md',
        targetTitle: 'Ada Lovelace',
        sourceTitle: 'Analytical Engine',
      },
    ],
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
  root = await mkdtemp(join(tmpdir(), 'ziba-links-'));
  getFilesystemAdapter().setVaultRoot(root);
  setCurrentVault({ root, name: 'test', openedAt: 0 });
  setIndexStore(makeIndexStore());

  await mkdir(join(root, 'Projects'), { recursive: true });
  await writeFile(
    join(root, 'Projects/Engine.md'),
    '# Analytical Engine\n\nThis note links to [[Ada Lovelace]] explicitly.',
    'utf8',
  );

  ftsHits = [
    {
      path: 'People/Ada.md',
      title: 'Ada Lovelace',
      snippet: '<mark>Ada Lovelace</mark> herself should not show.',
    },
    {
      path: 'Projects/Engine.md',
      title: 'Analytical Engine',
      snippet: 'This already links to <mark>Ada Lovelace</mark>.',
    },
    {
      path: 'Letters/Mention.md',
      title: 'A letter',
      snippet: 'A plain-text <mark>Ada Lovelace</mark> mention.',
    },
  ];
});

afterEach(async () => {
  setCurrentVault(null);
  setIndexStore(null);
  getFilesystemAdapter().setVaultRoot(null);
  await rm(root, { recursive: true, force: true });
});

describe('links references IPC', () => {
  it('returns explicit backlinks and unlinked mentions as separate sections', async () => {
    const { getReferences } = await import('./links');

    const result = await getReferences({ path: 'People/Ada.md' });

    expect(result.backlinks).toEqual([
      {
        kind: 'backlink',
        sourcePath: 'Projects/Engine.md',
        sourceTitle: 'Analytical Engine',
        context: expect.stringContaining('[[Ada Lovelace]]'),
      },
    ]);
    expect(result.mentions).toEqual([
      {
        kind: 'mention',
        sourcePath: 'Letters/Mention.md',
        sourceTitle: 'A letter',
        context: 'A plain-text <mark>Ada Lovelace</mark> mention.',
      },
    ]);
  });
});
