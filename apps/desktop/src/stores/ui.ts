import { create } from 'zustand';
import { applyTheme, DEFAULT_THEME_ID, isThemeId, type ThemeId } from '../lib/theme';

const STORAGE_KEY = 'ziba.ui.v1';

/**
 * Active tab in the right-side panel. The panel hosts both the
 * Backlinks list and the local-neighborhood mini-graph (v0.2 Wave 3).
 */
export type RightPaneTab = 'backlinks' | 'graph';

/**
 * Top-level view that occupies the editor + right-pane area. The sidebar
 * stays visible across all modes so the user can navigate notes / tags
 * regardless. `editor` is the default note-editing experience; `database`
 * shows the v0.3 typed query view; `graph` shows the v0.3 full vault graph.
 */
export type MainView = 'editor' | 'database' | 'graph';

/**
 * Sub-mode within the Database view. The same query (filters / sort /
 * groupBy) can be visualized as a sortable table (v0.3), a kanban-style
 * board grouped by a single property (v0.4), or a monthly calendar
 * grouped by a date property (v0.4). One DatabaseQuery, multiple shapes.
 */
export type DatabaseViewMode = 'table' | 'board' | 'calendar';

export const FOLDER_ICON_IDS = [
  'folder',
  'briefcase',
  'book',
  'archive',
  'star',
  'database',
  'image',
] as const;

export type FolderIconId = (typeof FOLDER_ICON_IDS)[number];

export const DEFAULT_FOLDER_ICON_ID: FolderIconId = 'folder';

export const FOLDER_ICON_LABELS: Record<FolderIconId, string> = {
  folder: 'cartella',
  briefcase: 'valigetta',
  book: 'libro',
  archive: 'archivio',
  star: 'stella',
  database: 'database',
  image: 'immagine',
};

export type FolderIconsByVault = Record<string, Record<string, FolderIconId>>;

type Persisted = {
  sidebarWidth: number;
  backlinksWidth: number;
  backlinksOpen: boolean;
  /**
   * Vault-relative paths of folders the user has expanded in the sidebar
   * tree. Stored as an array (not a Set) so it survives JSON serialization.
   */
  expandedFolders: string[];
  /**
   * Whether the "Tag" section of the sidebar is expanded. Persisted so the
   * user keeps their preferred layout across reloads.
   */
  tagsExpanded: boolean;
  /**
   * v1.0: whether the "Tipi" section of the sidebar is expanded.
   * Independent of `tagsExpanded` so the user can collapse one without
   * the other.
   */
  typesExpanded: boolean;
  /**
   * Active tab in the right-side panel. Persisted so users keep the same
   * view across reloads.
   */
  rightPaneTab: RightPaneTab;
  /** Top-level view (editor / database / graph). Persisted across reloads. */
  mainView: MainView;
  /**
   * Active sub-mode of the database view. Persisted independently of
   * `mainView` so swapping back to the database view restores the user's
   * preferred visualization without forcing a re-pick.
   */
  databaseViewMode: DatabaseViewMode;
  themeId: ThemeId;
  folderIconsByVault: FolderIconsByVault;
};

const DEFAULTS: Persisted = {
  sidebarWidth: 240,
  backlinksWidth: 280,
  backlinksOpen: false,
  expandedFolders: [],
  tagsExpanded: true,
  typesExpanded: true,
  rightPaneTab: 'backlinks',
  mainView: 'editor',
  databaseViewMode: 'table',
  themeId: DEFAULT_THEME_ID,
  folderIconsByVault: {},
};

function isRightPaneTab(v: unknown): v is RightPaneTab {
  return v === 'backlinks' || v === 'graph';
}

function isMainView(v: unknown): v is MainView {
  return v === 'editor' || v === 'database' || v === 'graph';
}

function isDatabaseViewMode(v: unknown): v is DatabaseViewMode {
  return v === 'table' || v === 'board' || v === 'calendar';
}

function isFolderIconId(v: unknown): v is FolderIconId {
  return typeof v === 'string' && (FOLDER_ICON_IDS as readonly string[]).includes(v);
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeFolderPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function matchesPathOrDescendant(path: string, target: string): boolean {
  return path === target || path.startsWith(`${target}/`);
}

function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return `${to}/${path.slice(from.length + 1)}`;
}

function dedupe(paths: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      next.push(p);
    }
  }
  return next;
}

function loadFolderIconsByVault(raw: unknown): FolderIconsByVault {
  if (!isPlainRecord(raw)) return DEFAULTS.folderIconsByVault;
  const out: FolderIconsByVault = {};

  for (const [vaultRoot, value] of Object.entries(raw)) {
    if (!isPlainRecord(value)) continue;
    const folderIcons: Record<string, FolderIconId> = {};
    for (const [folderPath, iconId] of Object.entries(value)) {
      const normalized = normalizeFolderPath(folderPath);
      if (normalized === '' || !isFolderIconId(iconId)) continue;
      folderIcons[normalized] = iconId;
    }
    if (Object.keys(folderIcons).length > 0) {
      out[vaultRoot] = folderIcons;
    }
  }

  return out;
}

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 480;
const MIN_BACKLINKS = 200;
const MAX_BACKLINKS = 520;

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function loadPersisted(): Persisted {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const p = parsed as Partial<Persisted>;
    return {
      sidebarWidth:
        typeof p.sidebarWidth === 'number'
          ? clamp(p.sidebarWidth, MIN_SIDEBAR, MAX_SIDEBAR)
          : DEFAULTS.sidebarWidth,
      backlinksWidth:
        typeof p.backlinksWidth === 'number'
          ? clamp(p.backlinksWidth, MIN_BACKLINKS, MAX_BACKLINKS)
          : DEFAULTS.backlinksWidth,
      backlinksOpen:
        typeof p.backlinksOpen === 'boolean' ? p.backlinksOpen : DEFAULTS.backlinksOpen,
      expandedFolders:
        Array.isArray(p.expandedFolders) &&
        p.expandedFolders.every((s): s is string => typeof s === 'string')
          ? p.expandedFolders
          : DEFAULTS.expandedFolders,
      tagsExpanded: typeof p.tagsExpanded === 'boolean' ? p.tagsExpanded : DEFAULTS.tagsExpanded,
      typesExpanded:
        typeof p.typesExpanded === 'boolean' ? p.typesExpanded : DEFAULTS.typesExpanded,
      rightPaneTab: isRightPaneTab(p.rightPaneTab) ? p.rightPaneTab : DEFAULTS.rightPaneTab,
      mainView: isMainView(p.mainView) ? p.mainView : DEFAULTS.mainView,
      databaseViewMode: isDatabaseViewMode(p.databaseViewMode)
        ? p.databaseViewMode
        : DEFAULTS.databaseViewMode,
      themeId: isThemeId(p.themeId) ? p.themeId : DEFAULTS.themeId,
      folderIconsByVault: loadFolderIconsByVault(p.folderIconsByVault),
    };
  } catch {
    return DEFAULTS;
  }
}

function savePersisted(p: Persisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // localStorage can throw in private mode or when full; UI sizes are
    // best-effort persistence so failure is silent.
  }
}

type UiState = Persisted & {
  /**
   * Ephemeral flag set by the Cmd/Ctrl+N keyboard shortcut and
   * consumed by `<NewNoteButton>` to open its prompt dialog.
   * Deliberately NOT persisted — a "should be open" state surviving
   * reloads would surprise the user.
   */
  newNotePromptOpen: boolean;
  setSidebarWidth(n: number): void;
  setBacklinksWidth(n: number): void;
  toggleBacklinks(): void;
  toggleFolder(path: string): void;
  setExpandedFolders(paths: string[]): void;
  toggleTags(): void;
  toggleTypes(): void;
  setRightPaneTab(tab: RightPaneTab): void;
  setMainView(view: MainView): void;
  setDatabaseViewMode(mode: DatabaseViewMode): void;
  setThemeId(themeId: ThemeId): void;
  setFolderIcon(vaultRoot: string, folderPath: string, iconId: FolderIconId): void;
  resetFolderIcon(vaultRoot: string, folderPath: string): void;
  remapFolderPrefsOnRename(vaultRoot: string, from: string, to: string): void;
  removeFolderPrefsOnDelete(vaultRoot: string, path: string): void;
  requestNewNotePrompt(): void;
  closeNewNotePrompt(): void;
};

export const useUiStore = create<UiState>((set, get) => {
  const initial = loadPersisted();
  applyTheme(initial.themeId);

  const persist = (): void => {
    const {
      sidebarWidth,
      backlinksWidth,
      backlinksOpen,
      expandedFolders,
      tagsExpanded,
      typesExpanded,
      rightPaneTab,
      mainView,
      databaseViewMode,
      themeId,
      folderIconsByVault,
    } = get();
    savePersisted({
      sidebarWidth,
      backlinksWidth,
      backlinksOpen,
      expandedFolders,
      tagsExpanded,
      typesExpanded,
      rightPaneTab,
      mainView,
      databaseViewMode,
      themeId,
      folderIconsByVault,
    });
  };

  return {
    ...initial,
    newNotePromptOpen: false,
    requestNewNotePrompt() {
      set({ newNotePromptOpen: true });
    },
    closeNewNotePrompt() {
      set({ newNotePromptOpen: false });
    },
    setSidebarWidth(n) {
      set({ sidebarWidth: clamp(n, MIN_SIDEBAR, MAX_SIDEBAR) });
      persist();
    },
    setBacklinksWidth(n) {
      set({ backlinksWidth: clamp(n, MIN_BACKLINKS, MAX_BACKLINKS) });
      persist();
    },
    toggleBacklinks() {
      set({ backlinksOpen: !get().backlinksOpen });
      persist();
    },
    toggleFolder(path) {
      const cur = get().expandedFolders;
      const next = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path];
      set({ expandedFolders: next });
      persist();
    },
    setExpandedFolders(paths) {
      // De-dupe defensively so callers can pass overlapping snapshots.
      set({ expandedFolders: dedupe(paths) });
      persist();
    },
    toggleTags() {
      set({ tagsExpanded: !get().tagsExpanded });
      persist();
    },
    toggleTypes() {
      set({ typesExpanded: !get().typesExpanded });
      persist();
    },
    setRightPaneTab(tab) {
      if (get().rightPaneTab === tab) return;
      set({ rightPaneTab: tab });
      persist();
    },
    setMainView(view) {
      if (get().mainView === view) return;
      set({ mainView: view });
      persist();
    },
    setDatabaseViewMode(mode) {
      if (get().databaseViewMode === mode) return;
      set({ databaseViewMode: mode });
      persist();
    },
    setThemeId(themeId) {
      if (get().themeId === themeId) return;
      set({ themeId });
      applyTheme(themeId);
      persist();
    },
    setFolderIcon(vaultRoot, folderPath, iconId) {
      const normalized = normalizeFolderPath(folderPath);
      if (normalized === '' || !isFolderIconId(iconId)) return;
      const byVault = get().folderIconsByVault;
      set({
        folderIconsByVault: {
          ...byVault,
          [vaultRoot]: {
            ...(byVault[vaultRoot] ?? {}),
            [normalized]: iconId,
          },
        },
      });
      persist();
    },
    resetFolderIcon(vaultRoot, folderPath) {
      const normalized = normalizeFolderPath(folderPath);
      const current = get().folderIconsByVault[vaultRoot];
      if (current === undefined || normalized === '') return;
      const nextVault = { ...current };
      delete nextVault[normalized];
      const next = { ...get().folderIconsByVault };
      if (Object.keys(nextVault).length === 0) {
        delete next[vaultRoot];
      } else {
        next[vaultRoot] = nextVault;
      }
      set({ folderIconsByVault: next });
      persist();
    },
    remapFolderPrefsOnRename(vaultRoot, from, to) {
      const normalizedFrom = normalizeFolderPath(from);
      const normalizedTo = normalizeFolderPath(to);
      if (normalizedFrom === '' || normalizedTo === '') return;

      const currentIcons = get().folderIconsByVault[vaultRoot] ?? {};
      const remappedIcons: Record<string, FolderIconId> = {};
      for (const [path, iconId] of Object.entries(currentIcons)) {
        const nextPath = matchesPathOrDescendant(path, normalizedFrom)
          ? remapPath(path, normalizedFrom, normalizedTo)
          : path;
        remappedIcons[nextPath] = iconId;
      }

      const nextIcons = { ...get().folderIconsByVault };
      if (Object.keys(remappedIcons).length > 0) {
        nextIcons[vaultRoot] = remappedIcons;
      } else {
        delete nextIcons[vaultRoot];
      }

      set({
        expandedFolders: dedupe(
          get().expandedFolders.map((path) =>
            matchesPathOrDescendant(path, normalizedFrom)
              ? remapPath(path, normalizedFrom, normalizedTo)
              : path,
          ),
        ),
        folderIconsByVault: nextIcons,
      });
      persist();
    },
    removeFolderPrefsOnDelete(vaultRoot, path) {
      const normalized = normalizeFolderPath(path);
      if (normalized === '') return;

      const currentIcons = get().folderIconsByVault[vaultRoot] ?? {};
      const keptIcons: Record<string, FolderIconId> = {};
      for (const [folderPath, iconId] of Object.entries(currentIcons)) {
        if (!matchesPathOrDescendant(folderPath, normalized)) {
          keptIcons[folderPath] = iconId;
        }
      }

      const nextIcons = { ...get().folderIconsByVault };
      if (Object.keys(keptIcons).length > 0) {
        nextIcons[vaultRoot] = keptIcons;
      } else {
        delete nextIcons[vaultRoot];
      }

      set({
        expandedFolders: get().expandedFolders.filter(
          (p) => !matchesPathOrDescendant(p, normalized),
        ),
        folderIconsByVault: nextIcons,
      });
      persist();
    },
  };
});

export const UI_LIMITS = {
  MIN_SIDEBAR,
  MAX_SIDEBAR,
  MIN_BACKLINKS,
  MAX_BACKLINKS,
} as const;
