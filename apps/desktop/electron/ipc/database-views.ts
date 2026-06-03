import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type {
  DatabaseViewDefinition,
  DatabaseViewLayout,
  DatabaseViewsFile,
  ScalarFilter,
} from '../../shared/ipc.js';
import { IpcChannels } from '../../shared/ipc.js';
import { requireVault } from '../state.js';

const DATABASE_VIEWS_VERSION = 1;
const DATABASE_VIEWS_PATH = ['.ziba', 'database-views.json'] as const;
const DEFAULT_VIEW_ID = 'default';

function now(): number {
  return Date.now();
}

function defaultView(timestamp = now()): DatabaseViewDefinition {
  return {
    id: DEFAULT_VIEW_ID,
    name: 'Tutte',
    layout: 'table',
    query: { filters: [], limit: 1000 },
    selectedType: null,
    columns: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function defaultFile(): DatabaseViewsFile {
  return {
    version: DATABASE_VIEWS_VERSION,
    activeViewId: DEFAULT_VIEW_ID,
    views: [defaultView()],
  };
}

function viewsPath(): string {
  return path.join(requireVault().root, ...DATABASE_VIEWS_PATH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLayout(value: unknown): value is DatabaseViewLayout {
  return value === 'table' || value === 'board' || value === 'calendar' || value === 'gallery';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? [...value]
    : [];
}

function isScalarFilter(value: unknown): value is ScalarFilter {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.key !== 'string') {
    return false;
  }
  switch (value.kind) {
    case 'has':
    case 'lacks':
      return true;
    case 'contains':
      return typeof value.value === 'string';
    case 'eq':
      return (
        typeof value.value === 'string' ||
        typeof value.value === 'number' ||
        typeof value.value === 'boolean'
      );
    case 'in':
      return (
        Array.isArray(value.values) &&
        value.values.every(
          (item) =>
            typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
        )
      );
    case 'lt':
    case 'gt':
    case 'lte':
    case 'gte':
      return typeof value.value === 'string' || typeof value.value === 'number';
    default:
      return false;
  }
}

function sanitizeQuery(raw: unknown): DatabaseViewDefinition['query'] {
  if (!isRecord(raw)) return { filters: [], limit: 1000 };
  const query: DatabaseViewDefinition['query'] = {};

  if (typeof raw.folder === 'string' && raw.folder.trim() !== '') query.folder = raw.folder;
  if (Array.isArray(raw.filters)) {
    query.filters = raw.filters.filter(isScalarFilter);
  } else {
    query.filters = [];
  }
  if (Array.isArray(raw.sort)) {
    const sort = raw.sort.flatMap((item) => {
      if (!isRecord(item)) return [];
      if (typeof item.key !== 'string') return [];
      if (item.direction !== 'asc' && item.direction !== 'desc') return [];
      const direction: 'asc' | 'desc' = item.direction;
      return [{ key: item.key, direction }];
    });
    if (sort.length > 0) query.sort = sort;
  }
  if (typeof raw.groupBy === 'string' && raw.groupBy.trim() !== '') query.groupBy = raw.groupBy;
  if (typeof raw.limit === 'number' && Number.isFinite(raw.limit) && raw.limit > 0) {
    query.limit = Math.floor(raw.limit);
  } else {
    query.limit = 1000;
  }

  return query;
}

function normalizeView(raw: unknown, fallbackId?: string): DatabaseViewDefinition | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : fallbackId;
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : null;
  if (id === undefined || name === null || !isLayout(raw.layout)) return null;

  const timestamp = now();
  return {
    id,
    name,
    layout: raw.layout,
    query: sanitizeQuery(raw.query),
    selectedType: typeof raw.selectedType === 'string' ? raw.selectedType : null,
    columns: stringArray(raw.columns),
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : timestamp,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : timestamp,
  };
}

function normalizeFile(raw: unknown): DatabaseViewsFile {
  if (!isRecord(raw)) return defaultFile();
  const views = Array.isArray(raw.views)
    ? raw.views.flatMap((item): DatabaseViewDefinition[] => {
        const view = normalizeView(item);
        return view === null ? [] : [view];
      })
    : [];

  if (views.length === 0) return defaultFile();
  const activeViewId =
    typeof raw.activeViewId === 'string' && views.some((view) => view.id === raw.activeViewId)
      ? raw.activeViewId
      : views[0]!.id;

  return {
    version: DATABASE_VIEWS_VERSION,
    activeViewId,
    views,
  };
}

async function readDatabaseViewsFile(): Promise<DatabaseViewsFile> {
  try {
    return normalizeFile(JSON.parse(await readFile(viewsPath(), 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultFile();
    if (err instanceof SyntaxError) return defaultFile();
    throw err;
  }
}

async function writeDatabaseViewsFile(file: DatabaseViewsFile): Promise<DatabaseViewsFile> {
  const normalized = normalizeFile(file);
  const filePath = viewsPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function emitChanged(win: BrowserWindow, file: DatabaseViewsFile): void {
  win.webContents.send(IpcChannels.databaseViewsChanged, file);
}

export async function listDatabaseViews(): Promise<DatabaseViewsFile> {
  return readDatabaseViewsFile();
}

export async function upsertDatabaseView(
  win: BrowserWindow,
  args: { view: DatabaseViewDefinition },
): Promise<DatabaseViewDefinition> {
  const current = await readDatabaseViewsFile();
  const index = current.views.findIndex((view) => view.id === args.view.id);
  const timestamp = now();
  const normalized = normalizeView(args.view, args.view.id);
  if (normalized === null) return defaultView(timestamp);

  const view: DatabaseViewDefinition = {
    ...normalized,
    createdAt: index >= 0 ? current.views[index]!.createdAt : normalized.createdAt,
    updatedAt: timestamp,
  };
  const views =
    index >= 0
      ? current.views.map((item, itemIndex) => (itemIndex === index ? view : item))
      : [...current.views.filter((item) => item.id !== DEFAULT_VIEW_ID), view];
  const file = await writeDatabaseViewsFile({
    version: DATABASE_VIEWS_VERSION,
    activeViewId: view.id,
    views,
  });
  emitChanged(win, file);
  return view;
}

export async function deleteDatabaseView(
  win: BrowserWindow,
  args: { id: string },
): Promise<DatabaseViewsFile> {
  const current = await readDatabaseViewsFile();
  const remaining = current.views.filter((view) => view.id !== args.id);
  const views = remaining.length > 0 ? remaining : [defaultView()];
  const activeViewId =
    current.activeViewId === args.id || !views.some((view) => view.id === current.activeViewId)
      ? views[0]!.id
      : current.activeViewId;
  const file = await writeDatabaseViewsFile({
    version: DATABASE_VIEWS_VERSION,
    activeViewId,
    views,
  });
  emitChanged(win, file);
  return file;
}

export async function duplicateDatabaseView(
  win: BrowserWindow,
  args: { id: string },
): Promise<DatabaseViewDefinition> {
  const current = await readDatabaseViewsFile();
  const source = current.views.find((view) => view.id === args.id) ?? current.views[0];
  const timestamp = now();
  const copy: DatabaseViewDefinition = {
    ...source!,
    id: randomUUID(),
    name: `${source!.name} copia`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const file = await writeDatabaseViewsFile({
    version: DATABASE_VIEWS_VERSION,
    activeViewId: copy.id,
    views: [...current.views, copy],
  });
  emitChanged(win, file);
  return copy;
}
