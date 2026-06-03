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
});
