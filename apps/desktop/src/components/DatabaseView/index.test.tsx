import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IpcChannels,
  type DatabaseResult,
  type DatabaseViewDefinition,
  type DatabaseViewsFile,
} from '../../../shared/ipc';
import { installMockIpc, type MockController } from '../../test/mock-ipc';
import { useDatabaseStore } from '../../stores/database';
import { useTagsStore } from '../../stores/tags';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { DatabaseView } from './index';

let mock: MockController;

function makeView(patch: Partial<DatabaseViewDefinition>): DatabaseViewDefinition {
  return {
    id: 'default',
    name: 'Tutte',
    layout: 'table',
    query: { filters: [], limit: 1000 },
    selectedType: null,
    columns: ['status'],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

function makeRows(): DatabaseResult {
  return {
    rows: [
      {
        path: 'Projects/Ziba.md',
        title: 'Ziba',
        mtimeMs: 0,
        properties: {
          status: { key: 'status', type: 'text', value: 'active' },
        },
      },
    ],
    groups: [],
    totalCount: 1,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mock = installMockIpc();
  const viewsFile: DatabaseViewsFile = {
    version: 1,
    activeViewId: 'default',
    views: [
      makeView({ id: 'default', name: 'Tutte' }),
      makeView({
        id: 'projects',
        name: 'Projects',
        layout: 'board',
        query: {
          filters: [{ kind: 'eq', key: 'status', value: 'active' }],
          groupBy: 'status',
          limit: 25,
        },
        selectedType: 'project',
      }),
    ],
  };
  mock.setHandler(IpcChannels.listDatabaseViews, async () => viewsFile);
  mock.setHandler(IpcChannels.runDatabaseQuery, async () => makeRows());
  mock.setHandler(IpcChannels.loadNote, async ({ path }) => ({
    path,
    title: 'Ziba',
    content: '# Ziba',
    frontmatter: { status: 'active' },
    wikilinks: [],
    mtimeMs: 0,
  }));
  mock.setHandler(IpcChannels.saveNote, async () => ({ mtimeMs: 1 }));
  mock.setHandler(IpcChannels.upsertDatabaseView, async ({ view }) => view);
  useVaultStore.setState({
    current: { root: '/vault-a', name: 'vault-a', openedAt: 0 },
    notes: [],
  });
  useTagsStore.setState({ types: [], objectTypeSchemas: [] });
  useUiStore.setState({ databaseViewMode: 'table' });
  useToastStore.getState().clear();
  useDatabaseStore.setState({
    query: { filters: [], limit: 1000 },
    result: null,
    loading: false,
    error: null,
    availableProperties: [],
    lastUpdatedAt: null,
    selectedType: null,
  });
});

describe('<DatabaseView>', () => {
  it('loads saved views, applies the selected view, and persists layout changes', async () => {
    render(<DatabaseView />);

    expect(await screen.findByRole('tab', { name: 'Tutte' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Projects' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));

    await waitFor(() => {
      const calls = mock.getCallsFor(IpcChannels.runDatabaseQuery);
      expect(calls.at(-1)?.[0]).toEqual({
        query: expect.objectContaining({
          filters: [
            { kind: 'eq', key: 'type', value: 'project' },
            { kind: 'eq', key: 'status', value: 'active' },
          ],
          groupBy: 'status',
          limit: 25,
        }),
      });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Galleria' }));

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.upsertDatabaseView)).toHaveBeenCalledWith({
        view: expect.objectContaining({
          id: 'projects',
          layout: 'gallery',
          columns: ['status'],
        }),
      });
    });
  });

  it('uses the embedded initial view and reports view changes to the host node', async () => {
    const onActiveViewChange = vi.fn();

    render(
      <DatabaseView embedded initialViewId="projects" onActiveViewChange={onActiveViewChange} />,
    );

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await waitFor(() => {
      const calls = mock.getCallsFor(IpcChannels.runDatabaseQuery);
      expect(calls.at(-1)?.[0]).toEqual({
        query: expect.objectContaining({
          filters: [
            { kind: 'eq', key: 'type', value: 'project' },
            { kind: 'eq', key: 'status', value: 'active' },
          ],
          groupBy: 'status',
          limit: 25,
        }),
      });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Tutte' }));

    expect(onActiveViewChange).toHaveBeenCalledWith('default');
  });

  it('commits table cell edits back to note frontmatter', async () => {
    render(<DatabaseView />);

    const status = await screen.findByLabelText('status per Ziba');
    fireEvent.change(status, { target: { value: 'done' } });
    fireEvent.blur(status);

    await waitFor(() => {
      expect(mock.getSpy(IpcChannels.saveNote)).toHaveBeenCalledWith({
        path: 'Projects/Ziba.md',
        body: '# Ziba',
        frontmatter: { status: 'done' },
      });
    });
  });

  it('opens and closes the saved-view menu with outside click and Escape', async () => {
    render(<DatabaseView />);

    const trigger = await screen.findByRole('button', { name: 'Vista' });

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables saved-view actions while duplicate is pending and applies the returned copy', async () => {
    const copy = makeView({ id: 'projects-copy', name: 'Projects copia' });
    const pending = deferred<DatabaseViewDefinition>();
    mock.setHandler(IpcChannels.duplicateDatabaseView, async () => pending.promise);

    render(<DatabaseView />);

    await screen.findByRole('tab', { name: 'Tutte' });
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplica' }));

    expect(mock.getSpy(IpcChannels.duplicateDatabaseView)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Vista' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Vista' }));
    expect(mock.getSpy(IpcChannels.duplicateDatabaseView)).toHaveBeenCalledTimes(1);

    pending.resolve(copy);

    expect(await screen.findByRole('tab', { name: 'Projects copia' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Vista' })).not.toBeDisabled();
  });

  it('keeps one tab when a duplicate event arrives before the duplicate request resolves', async () => {
    const copy = makeView({ id: 'projects-copy', name: 'Projects copia' });
    const pending = deferred<DatabaseViewDefinition>();
    mock.setHandler(IpcChannels.duplicateDatabaseView, async () => pending.promise);

    render(<DatabaseView />);

    await screen.findByRole('tab', { name: 'Tutte' });
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplica' }));

    mock.triggerDatabaseViewsChanged({
      version: 1,
      activeViewId: copy.id,
      views: [
        makeView({ id: 'default', name: 'Tutte' }),
        makeView({ id: 'projects', name: 'Projects' }),
        copy,
      ],
    });
    pending.resolve(copy);

    await waitFor(() => {
      expect(screen.getAllByRole('tab', { name: 'Projects copia' })).toHaveLength(1);
    });
  });

  it('shows a toast and preserves the active view when duplicate fails', async () => {
    mock.setHandler(IpcChannels.duplicateDatabaseView, async () => {
      throw new Error('[INTERNAL] disco pieno');
    });

    render(<DatabaseView />);

    await screen.findByRole('tab', { name: 'Tutte' });
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplica' }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
        kind: 'error',
        title: 'Impossibile duplicare la vista',
        message: 'disco pieno',
      });
    });
    expect(screen.queryByRole('tab', { name: /copia/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not delete the final saved view', async () => {
    const singleViewFile: DatabaseViewsFile = {
      version: 1,
      activeViewId: 'default',
      views: [makeView({ id: 'default', name: 'Tutte' })],
    };
    mock.setHandler(IpcChannels.listDatabaseViews, async () => singleViewFile);

    render(<DatabaseView />);

    await screen.findByRole('tab', { name: 'Tutte' });
    fireEvent.click(screen.getByRole('button', { name: 'Vista' }));

    const deleteButton = screen.getByRole('menuitem', { name: 'Elimina' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);
    expect(mock.getSpy(IpcChannels.deleteDatabaseView)).not.toHaveBeenCalled();
  });
});
