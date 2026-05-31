import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFilesystemAdapter } from '../adapters/filesystem.electron';
import { setCurrentVault } from '../state';
import { listFolders } from './folder';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ziba-folders-'));
  getFilesystemAdapter().setVaultRoot(root);
  setCurrentVault({ root, name: 'test', openedAt: 0 });
});

afterEach(async () => {
  setCurrentVault(null);
  getFilesystemAdapter().setVaultRoot(null);
  await rm(root, { recursive: true, force: true });
});

describe('folder:list', () => {
  it('matches vault scan skip rules for dot dirs and node_modules', async () => {
    await mkdir(join(root, 'projects', 'ziba'), { recursive: true });
    await mkdir(join(root, 'projects', '.private'), { recursive: true });
    await mkdir(join(root, '.ziba', 'schema'), { recursive: true });
    await mkdir(join(root, '.git', 'objects'), { recursive: true });
    await mkdir(join(root, '.obsidian', 'plugins'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });

    await expect(listFolders()).resolves.toEqual(['projects', 'projects/ziba']);
  });
});
