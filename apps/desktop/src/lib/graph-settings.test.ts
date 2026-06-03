import { beforeEach, describe, expect, it } from 'vitest';

const STORAGE_KEY = 'ziba.graph-settings.v1';

async function loadGraphSettings(): Promise<typeof import('./graph-settings')> {
  return import('./graph-settings');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('graph settings defaults', () => {
  it('matches the Obsidian-style graph defaults', async () => {
    const { DEFAULT_GRAPH_SETTINGS } = await loadGraphSettings();

    expect(DEFAULT_GRAPH_SETTINGS.query).toMatchObject({
      search: '',
      tags: [],
      folders: [],
      paths: [],
      types: [],
      relationKinds: [],
      includeUnresolved: true,
      includeOrphans: true,
      existingOnly: false,
      focusMode: false,
      localDepth: 1,
    });
    expect(DEFAULT_GRAPH_SETTINGS.display).toMatchObject({
      showArrows: false,
      showText: true,
      showNodes: true,
      showLinks: true,
      labelFade: 0.48,
      nodeScale: 1,
      linkWidth: 0.7,
      showGrid: false,
    });
    expect(DEFAULT_GRAPH_SETTINGS.forces).toMatchObject({
      center: 0.08,
      repel: 420,
      link: 0.08,
      linkDistance: 96,
      nodeDistance: 32,
      linkOpacity: 0.18,
    });
    expect(DEFAULT_GRAPH_SETTINGS.groups).toEqual([]);
    expect(DEFAULT_GRAPH_SETTINGS.groupsSeeded).toBe(false);
  });
});

describe('graph settings storage', () => {
  it('persists and reloads settings per vault root', async () => {
    const { DEFAULT_GRAPH_SETTINGS, loadGraphSettingsForVault, saveGraphSettingsForVault } =
      await loadGraphSettings();

    saveGraphSettingsForVault('/vault-a', {
      ...DEFAULT_GRAPH_SETTINGS,
      query: { ...DEFAULT_GRAPH_SETTINGS.query, search: 'ziba', includeOrphans: false },
    });
    saveGraphSettingsForVault('/vault-b', {
      ...DEFAULT_GRAPH_SETTINGS,
      display: { ...DEFAULT_GRAPH_SETTINGS.display, showText: false },
    });

    expect(loadGraphSettingsForVault('/vault-a').query.search).toBe('ziba');
    expect(loadGraphSettingsForVault('/vault-a').query.includeOrphans).toBe(false);
    expect(loadGraphSettingsForVault('/vault-b').display.showText).toBe(false);
  });

  it('falls back cleanly when localStorage JSON is corrupt', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const { DEFAULT_GRAPH_SETTINGS, loadGraphSettingsForVault } = await loadGraphSettings();

    expect(loadGraphSettingsForVault('/vault-a')).toEqual(DEFAULT_GRAPH_SETTINGS);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('strictly validates nested persisted settings and drops invalid groups', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '/vault-a': {
          query: {
            search: 42,
            tags: ['#ok', 12],
            includeUnresolved: false,
            includeOrphans: 'yes',
            existingOnly: true,
            focusMode: true,
            localDepth: 99,
          },
          display: {
            showArrows: false,
            showText: 'no',
            showNodes: true,
            showLinks: false,
            labelFade: 3,
            nodeScale: 0,
            linkWidth: 12,
            showGrid: true,
          },
          forces: {
            center: 2,
            repel: -10,
            link: 0.4,
            linkDistance: 120,
            nodeDistance: Number.NaN,
            linkOpacity: 0.7,
          },
          groupsSeeded: 'yes',
          groups: [
            { id: 'ok', name: 'People', enabled: true, query: 'type:person', color: '#ef4444' },
            { id: '', name: 'Bad', enabled: true, query: 'tag:x', color: 'red' },
          ],
        },
      }),
    );

    const { loadGraphSettingsForVault } = await loadGraphSettings();
    const settings = loadGraphSettingsForVault('/vault-a');

    expect(settings.query.search).toBe('');
    expect(settings.query.tags).toEqual([]);
    expect(settings.query.includeUnresolved).toBe(false);
    expect(settings.query.includeOrphans).toBe(true);
    expect(settings.query.existingOnly).toBe(true);
    expect(settings.query.focusMode).toBe(true);
    expect(settings.query.localDepth).toBe(6);
    expect(settings.display).toMatchObject({
      showArrows: false,
      showText: true,
      showNodes: true,
      showLinks: false,
      labelFade: 1,
      nodeScale: 0.2,
      linkWidth: 4,
      showGrid: true,
    });
    expect(settings.forces).toMatchObject({
      center: 1,
      repel: 0,
      link: 0.4,
      linkDistance: 120,
      nodeDistance: 32,
      linkOpacity: 0.7,
    });
    expect(settings.groups).toEqual([
      { id: 'ok', name: 'People', enabled: true, query: 'type:person', color: '#ef4444' },
    ]);
    expect(settings.groupsSeeded).toBe(false);
  });

  it('migrates old persisted settings by filling newly added fields', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        '/vault-a': {
          query: { search: 'old' },
          display: {
            showArrows: true,
            showText: false,
            showNodes: true,
            showLinks: true,
          },
          forces: { linkOpacity: 0.32 },
          groups: [],
        },
      }),
    );

    const { loadGraphSettingsForVault } = await loadGraphSettings();
    const settings = loadGraphSettingsForVault('/vault-a');

    expect(settings.display).toMatchObject({
      showArrows: true,
      showText: false,
      showNodes: true,
      showLinks: true,
      labelFade: 0.48,
      nodeScale: 1,
      linkWidth: 0.7,
      showGrid: false,
    });
    expect(settings.forces.linkOpacity).toBe(0.32);
    expect(settings.groupsSeeded).toBe(false);
  });
});
