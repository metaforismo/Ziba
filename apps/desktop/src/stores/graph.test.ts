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

    useGraphSettingsStore.getState().removeGroup(groupId);
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);

    useGraphSettingsStore.getState().updateForces({ repel: 200 });
    useGraphSettingsStore.getState().resetSettings();
    expect(useGraphSettingsStore.getState().settings).toEqual(DEFAULT_GRAPH_SETTINGS);
  });

  it('starts monochrome with no groups and never auto-seeds folder groups', async () => {
    const { DEFAULT_GRAPH_SETTINGS, useGraphSettingsStore } = await loadGraphStore();

    // Default state for a fresh vault: zero color groups (Obsidian-like).
    expect(DEFAULT_GRAPH_SETTINGS.groups).toEqual([]);

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);

    // No mounting / folder data should ever inject groups: the store has no
    // seeding action anymore. The graph stays monochrome until the user
    // creates a group manually.
    expect(
      (useGraphSettingsStore.getState() as Record<string, unknown>).seedGroupsFromTopLevelFolders,
    ).toBeUndefined();

    // Nothing got persisted for this vault yet (no settings changes).
    const persistedRaw = window.localStorage.getItem(STORAGE_KEY);
    expect(persistedRaw === null || JSON.parse(persistedRaw)['/vault-a'] === undefined).toBe(true);
  });

  it('keeps manually-created groups and persists them per vault', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    const id = useGraphSettingsStore.getState().addGroup({
      name: 'Persone',
      query: 'type:person',
      color: '#14b8a6',
    });

    expect(useGraphSettingsStore.getState().settings.groups).toEqual([
      { id, name: 'Persone', query: 'type:person', color: '#14b8a6', enabled: true },
    ]);

    // Persisted for /vault-a only.
    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(persisted['/vault-a'].groups).toEqual([
      { id, name: 'Persone', query: 'type:person', color: '#14b8a6', enabled: true },
    ]);
  });

  it('reloads persisted user groups when returning to a vault', async () => {
    const { useGraphSettingsStore } = await loadGraphStore();

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    const id = useGraphSettingsStore.getState().addGroup({
      name: 'Progetti',
      query: 'path:Projects',
      color: '#6366f1',
    });

    // Switch away and back: the group must survive the round-trip through
    // localStorage (the persistence path, not in-memory state).
    useGraphSettingsStore.getState().setVaultRoot('/vault-b');
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([]);

    useGraphSettingsStore.getState().setVaultRoot('/vault-a');
    expect(useGraphSettingsStore.getState().settings.groups).toEqual([
      { id, name: 'Progetti', query: 'path:Projects', color: '#6366f1', enabled: true },
    ]);
  });
});
