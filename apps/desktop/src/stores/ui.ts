import { create } from 'zustand';

const STORAGE_KEY = 'synapsium.ui.v1';

/**
 * Active tab in the right-side panel. The panel hosts both the
 * Backlinks list and the local-neighborhood mini-graph (v0.2 Wave 3).
 */
export type RightPaneTab = 'backlinks' | 'graph';

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
   * Active tab in the right-side panel. Persisted so users keep the same
   * view across reloads.
   */
  rightPaneTab: RightPaneTab;
};

const DEFAULTS: Persisted = {
  sidebarWidth: 240,
  backlinksWidth: 280,
  backlinksOpen: true,
  expandedFolders: [],
  tagsExpanded: true,
  rightPaneTab: 'backlinks',
};

function isRightPaneTab(v: unknown): v is RightPaneTab {
  return v === 'backlinks' || v === 'graph';
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
      rightPaneTab: isRightPaneTab(p.rightPaneTab) ? p.rightPaneTab : DEFAULTS.rightPaneTab,
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
  setSidebarWidth(n: number): void;
  setBacklinksWidth(n: number): void;
  toggleBacklinks(): void;
  toggleFolder(path: string): void;
  setExpandedFolders(paths: string[]): void;
  toggleTags(): void;
  setRightPaneTab(tab: RightPaneTab): void;
};

export const useUiStore = create<UiState>((set, get) => {
  const initial = loadPersisted();

  const persist = (): void => {
    const {
      sidebarWidth,
      backlinksWidth,
      backlinksOpen,
      expandedFolders,
      tagsExpanded,
      rightPaneTab,
    } = get();
    savePersisted({
      sidebarWidth,
      backlinksWidth,
      backlinksOpen,
      expandedFolders,
      tagsExpanded,
      rightPaneTab,
    });
  };

  return {
    ...initial,
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
      const seen = new Set<string>();
      const next: string[] = [];
      for (const p of paths) {
        if (!seen.has(p)) {
          seen.add(p);
          next.push(p);
        }
      }
      set({ expandedFolders: next });
      persist();
    },
    toggleTags() {
      set({ tagsExpanded: !get().tagsExpanded });
      persist();
    },
    setRightPaneTab(tab) {
      if (get().rightPaneTab === tab) return;
      set({ rightPaneTab: tab });
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
