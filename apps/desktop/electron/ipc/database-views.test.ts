import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels, type DatabaseViewDefinition } from '../../shared/ipc';
import { setCurrentVault } from '../state';

let root: string;

function makeView(patch: Partial<DatabaseViewDefinition> = {}): DatabaseViewDefinition {
  return {
    id: 'view-1',
    name: 'Projects',
    layout: 'board',
    query: {
      filters: [{ kind: 'eq', key: 'status', value: 'active' }],
      sort: [{ key: 'title', direction: 'asc' }],
      groupBy: 'status',
      limit: 25,
    },
    selectedType: 'project',
    columns: ['status', 'owner'],
    createdAt: 10,
    updatedAt: 10,
    ...patch,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ziba-database-views-'));
  setCurrentVault({ root, name: 'test', openedAt: 0 });
});

afterEach(async () => {
  setCurrentVault(null);
  await rm(root, { recursive: true, force: true });
});

describe('database views IPC', () => {
  it('returns a default view when the vault has no persisted views file', async () => {
    const { listDatabaseViews } = await import('./database-views');

    const file = await listDatabaseViews();

    expect(file.version).toBe(1);
    expect(file.views).toEqual([
      expect.objectContaining({
        id: 'default',
        name: 'Tutte',
        layout: 'table',
        columns: [],
      }),
    ]);
    expect(file.activeViewId).toBe('default');
  });

  it('persists upserted views under <vault>/.ziba/database-views.json', async () => {
    const { upsertDatabaseView } = await import('./database-views');
    const win = { webContents: { send: vi.fn() } };

    const saved = await upsertDatabaseView(win as never, { view: makeView() });
    const raw = await readFile(join(root, '.ziba/database-views.json'), 'utf8');
    const parsed = JSON.parse(raw);

    expect(saved).toEqual(expect.objectContaining({ id: 'view-1', name: 'Projects' }));
    expect(parsed.views).toEqual([expect.objectContaining({ id: 'view-1', layout: 'board' })]);
    expect(parsed.activeViewId).toBe('view-1');
    expect(win.webContents.send).toHaveBeenCalledWith(
      IpcChannels.databaseViewsChanged,
      expect.objectContaining({ activeViewId: 'view-1' }),
    );
  });

  it('duplicates and deletes views while keeping a valid activeViewId', async () => {
    const { deleteDatabaseView, duplicateDatabaseView, upsertDatabaseView } =
      await import('./database-views');
    const win = { webContents: { send: vi.fn() } };

    await mkdir(join(root, '.ziba'), { recursive: true });
    await upsertDatabaseView(win as never, { view: makeView() });

    const copy = await duplicateDatabaseView(win as never, { id: 'view-1' });
    expect(copy.id).not.toBe('view-1');
    expect(copy.name).toBe('Projects copia');

    const afterDelete = await deleteDatabaseView(win as never, { id: 'view-1' });
    expect(afterDelete.views.map((view) => view.id)).toEqual([copy.id]);
    expect(afterDelete.activeViewId).toBe(copy.id);
  });
});
