import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'ziba.ui.v1';

// `useUiStore` reads localStorage at module load. We `vi.resetModules()`
// before every test so each can preload its own localStorage state and
// observe the fresh hydration path.
async function loadUiStore(): Promise<typeof import('./ui')> {
  vi.resetModules();
  return import('./ui');
}

beforeEach(() => {
  // Make sure no leftover state from earlier tests bleeds in.
  window.localStorage.clear();
});

afterEach(() => {
  // setup.ts re-clears, but being explicit keeps the contract obvious.
});

describe('useUiStore — clamping', () => {
  it('setSidebarWidth clamps to MIN_SIDEBAR / MAX_SIDEBAR', async () => {
    const { useUiStore, UI_LIMITS } = await loadUiStore();
    useUiStore.getState().setSidebarWidth(50);
    expect(useUiStore.getState().sidebarWidth).toBe(UI_LIMITS.MIN_SIDEBAR);
    useUiStore.getState().setSidebarWidth(99999);
    expect(useUiStore.getState().sidebarWidth).toBe(UI_LIMITS.MAX_SIDEBAR);
    useUiStore.getState().setSidebarWidth(300);
    expect(useUiStore.getState().sidebarWidth).toBe(300);
  });
});

describe('useUiStore — toggles & persistence', () => {
  it('sets the theme, applies it to documentElement, and persists it', async () => {
    const { useUiStore } = await loadUiStore();

    useUiStore.getState().setThemeId('obsidian-dark');

    expect(useUiStore.getState().themeId).toBe('obsidian-dark');
    expect(document.documentElement.dataset.theme).toBe('obsidian-dark');

    const persistedRaw = window.localStorage.getItem(STORAGE_KEY);
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw!);
    expect(persisted.themeId).toBe('obsidian-dark');
  });

  it('setThemeId same-value is a no-op (no localStorage write)', async () => {
    const { useUiStore } = await loadUiStore();
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');

    useUiStore.getState().setThemeId('ziba-light');

    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('toggleBacklinks flips the boolean and persists', async () => {
    const { useUiStore } = await loadUiStore();
    const before = useUiStore.getState().backlinksOpen;
    useUiStore.getState().toggleBacklinks();
    expect(useUiStore.getState().backlinksOpen).toBe(!before);

    const persistedRaw = window.localStorage.getItem(STORAGE_KEY);
    expect(persistedRaw).not.toBeNull();
    const persisted = JSON.parse(persistedRaw!);
    expect(persisted.backlinksOpen).toBe(!before);
  });

  it('toggleFolder adds new path / removes existing path', async () => {
    const { useUiStore } = await loadUiStore();
    useUiStore.getState().toggleFolder('projects');
    expect(useUiStore.getState().expandedFolders).toContain('projects');
    useUiStore.getState().toggleFolder('projects');
    expect(useUiStore.getState().expandedFolders).not.toContain('projects');
    useUiStore.getState().toggleFolder('a');
    useUiStore.getState().toggleFolder('b');
    expect(useUiStore.getState().expandedFolders).toEqual(['a', 'b']);
  });

  it('setMainView same-value is a no-op (no localStorage write)', async () => {
    const { useUiStore } = await loadUiStore();
    // Force a known starting view + clear any localStorage write that
    // happened during hydration.
    useUiStore.getState().setMainView('database');
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    useUiStore.getState().setMainView('database');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('setRightPaneTab same-value is a no-op (no localStorage write)', async () => {
    const { useUiStore } = await loadUiStore();
    useUiStore.getState().setRightPaneTab('graph');
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    useUiStore.getState().setRightPaneTab('graph');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('sets and resets per-vault custom folder icons', async () => {
    const { useUiStore } = await loadUiStore();

    useUiStore.getState().setFolderIcon('/vault-a', 'projects/ziba', 'briefcase');

    expect(useUiStore.getState().folderIconsByVault).toEqual({
      '/vault-a': {
        'projects/ziba': 'briefcase',
      },
    });

    useUiStore.getState().resetFolderIcon('/vault-a', 'projects/ziba');

    expect(useUiStore.getState().folderIconsByVault).toEqual({});
  });

  it('remaps folder icons and expanded folders with segment-boundary matching on rename', async () => {
    const { useUiStore } = await loadUiStore();
    useUiStore.setState({
      expandedFolders: ['a/b', 'a/b/c', 'a/bc'],
      folderIconsByVault: {
        '/vault-a': {
          'a/b': 'briefcase',
          'a/b/c': 'book',
          'a/bc': 'star',
        },
      },
    });

    useUiStore.getState().remapFolderPrefsOnRename('/vault-a', 'a/b', 'x/y');

    expect(useUiStore.getState().expandedFolders).toEqual(['x/y', 'x/y/c', 'a/bc']);
    expect(useUiStore.getState().folderIconsByVault['/vault-a']).toEqual({
      'x/y': 'briefcase',
      'x/y/c': 'book',
      'a/bc': 'star',
    });
  });

  it('removes folder icons and expanded folders with segment-boundary matching on delete', async () => {
    const { useUiStore } = await loadUiStore();
    useUiStore.setState({
      expandedFolders: ['a/b', 'a/b/c', 'a/bc'],
      folderIconsByVault: {
        '/vault-a': {
          'a/b': 'briefcase',
          'a/b/c': 'book',
          'a/bc': 'star',
        },
      },
    });

    useUiStore.getState().removeFolderPrefsOnDelete('/vault-a', 'a/b');

    expect(useUiStore.getState().expandedFolders).toEqual(['a/bc']);
    expect(useUiStore.getState().folderIconsByVault['/vault-a']).toEqual({
      'a/bc': 'star',
    });
  });
});

describe('useUiStore — loadPersisted validator', () => {
  it('falls back to defaults when localStorage JSON is corrupt', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const { useUiStore } = await loadUiStore();
    const s = useUiStore.getState();
    expect(s.sidebarWidth).toBe(240);
    expect(s.rightPaneTab).toBe('references');
    expect(s.mainView).toBe('editor');
    expect(s.expandedFolders).toEqual([]);
    expect(s.themeId).toBe('ziba-light');
    expect(document.documentElement.dataset.theme).toBe('ziba-light');
  });

  it('falls back per-field when individual values are wrong types', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sidebarWidth: 'not a number',
        backlinksWidth: 280,
        backlinksOpen: 'nope',
        expandedFolders: ['ok', 42, null], // mixed array → reject whole field
        tagsExpanded: true,
        rightPaneTab: 'invalid',
        mainView: 'editor',
        themeId: 'midnight',
      }),
    );
    const { useUiStore } = await loadUiStore();
    const s = useUiStore.getState();
    expect(s.sidebarWidth).toBe(240); // default
    expect(s.backlinksWidth).toBe(280); // valid passthrough
    expect(s.backlinksOpen).toBe(false); // default (since 'nope' is not boolean)
    expect(s.expandedFolders).toEqual([]); // mixed array rejected wholesale
    expect(s.tagsExpanded).toBe(true);
    expect(s.rightPaneTab).toBe('references'); // default
    expect(s.mainView).toBe('editor');
    expect(s.themeId).toBe('ziba-light');
    expect(document.documentElement.dataset.theme).toBe('ziba-light');
  });

  it('migrates the legacy backlinks tab to References on load', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rightPaneTab: 'backlinks',
      }),
    );

    const { useUiStore } = await loadUiStore();

    expect(useUiStore.getState().rightPaneTab).toBe('references');
  });

  it('loads and applies a valid persisted theme id', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        themeId: 'warm-paper',
      }),
    );

    const { useUiStore } = await loadUiStore();

    expect(useUiStore.getState().themeId).toBe('warm-paper');
    expect(document.documentElement.dataset.theme).toBe('warm-paper');
  });

  it('clamps persisted widths into valid range on load', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sidebarWidth: 9999,
        backlinksWidth: 0,
      }),
    );
    const { useUiStore, UI_LIMITS } = await loadUiStore();
    expect(useUiStore.getState().sidebarWidth).toBe(UI_LIMITS.MAX_SIDEBAR);
    expect(useUiStore.getState().backlinksWidth).toBe(UI_LIMITS.MIN_BACKLINKS);
  });

  it('drops invalid persisted folder icon ids while keeping valid vault mappings', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        folderIconsByVault: {
          '/vault-a': {
            projects: 'briefcase',
            bad: 'emoji-rocket',
          },
          '/vault-b': null,
        },
      }),
    );

    const { useUiStore } = await loadUiStore();

    expect(useUiStore.getState().folderIconsByVault).toEqual({
      '/vault-a': {
        projects: 'briefcase',
      },
    });
  });
});
