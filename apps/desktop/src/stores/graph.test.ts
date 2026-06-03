import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'ziba.graph-settings.v1';

async function loadGraphStore(): Promise<typeof import('./graph')> {
  vi.resetModules();
  return import('./graph');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useGraphSettingsStore', () => {
  it('loads the active vault settings and persists updates to that vault only', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    useGraphSettingsStore.getState().updateQuery({ search: 'alpha' });
    useGraphSettingsStore.getState().setVaultRoot('/vault-b');
    useGraphSettingsStore.getState().updateDisplay({ showText: false });
    useGraphSettingsStore.getState().setVaultRoot('/vault-a');

    expect(useGraphSettingsStore.getState().settings.query.search).toBe('alpha');
    expect(useGraphSettingsStore.getState().settings.display.showText).toBe(true);

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(persisted['/vault-a'].query.search).toBe('alpha');
    expect(persisted['/vault-b'].display.showText).toBe(false);
  });

  it('adds, updates, removes, and resets groups through the store', async () => {
    const { DEFAULT_GRAPH_SETTINGS, useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    const groupId = useGraphSettingsStore.getState().addGroup({
      name: 'People',
      query: 'type:person',
      color: '#14b8a6',
    });
    useGraphSettingsStore.getState().updateGroup(groupId, { enabled: false });

    expect(useGraphSettingsStore.getState().settings.groups).toEqual([
      { id: groupId, name: 'People', query: 'type:person', color: '#14b8a6', enabled: false },
    ]);
    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(true);

    useGraphSettingsStore.getState().removeGroup(groupId);
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);

    useGraphSettingsStore.getState().updateForces({ repel: 200 });
    useGraphSettingsStore.getState().resetSettings();
    expect(useGraphSettingsStore.getState().settings).toEqual(DEFAULT_GRAPH_SETTINGS);
  });

  it('does not add automatic groups after a manual group has been created', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    useGraphSettingsStore.getState().addGroup({
      name: 'Manuale',
      query: 'type:idea',
      color: '#64748b',
    });
    useGraphSettingsStore.getState().seedGroupsFromTopLevelFolders(['Projects', 'People']);

    expect(useGraphSettingsStore.getState().settings.groups.map((group) => group.name)).toEqual([
      'Manuale',
    ]);
    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(true);
  });

  it('seeds automatic folder groups once and does not regenerate after deletion', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    useGraphSettingsStore
      .getState()
      .seedGroupsFromTopLevelFolders(['Projects', 'People', 'Areas', 'Resources']);

    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(true);
    expect(useGraphSettingsStore.getState().settings.groups.map((group) => group.name)).toEqual([
      'Projects',
      'People',
      'Areas',
      'Resources',
    ]);

    for (const group of useGraphSettingsStore.getState().settings.groups) {
      useGraphSettingsStore.getState().removeGroup(group.id);
    }

    useGraphSettingsStore.getState().seedGroupsFromTopLevelFolders(['Projects', 'People']);

    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);
    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(true);

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(persisted['/vault-a'].groupsSeeded).toBe(true);
    expect(persisted['/vault-a'].groups).toEqual([]);
  });

  it('does not burn the automatic seed flag when there are no folders yet', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    useGraphSettingsStore.getState().seedGroupsFromTopLevelFolders([]);

    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(false);
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);

    useGraphSettingsStore.getState().seedGroupsFromTopLevelFolders(['Projects']);

    expect(useGraphSettingsStore.getState().settings.groups.map((group) => group.name)).toEqual([
      'Projects',
    ]);
    expect(useGraphSettingsStore.getState().settings.groupsSeeded).toBe(true);
  });
});
