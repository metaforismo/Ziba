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
});
