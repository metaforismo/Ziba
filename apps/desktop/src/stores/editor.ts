import type { Frontmatter, Note, NotePath } from '@ziba/core';
import { create } from 'zustand';
import { ipc } from '../lib/ipc';
import { ipcErrorMessage } from '../lib/ipc-error';
import { toast } from './toast';
import { useVaultStore } from './vault';

export type OpenNoteMode = 'replace-active' | 'new-tab' | 'split-right' | 'split-down';

export type OpenNoteOptions = {
  mode?: OpenNoteMode;
  reuseExisting?: boolean;
};

export type CreateUntitledNoteOptions = {
  parentFolder?: string;
  mode?: OpenNoteMode;
};

export type EditorTab = {
  id: string;
  path: NotePath;
  title: string;
  note: Note | null;
  dirty: boolean;
  loading: boolean;
  lastSaveError: string | null;
};

export type EditorPane = {
  id: string;
  tabIds: string[];
  activeTabId: string | null;
};

export type EditorWorkspace = {
  panes: EditorPane[];
  tabsById: Record<string, EditorTab>;
  activePaneId: string;
};

type EditorState = {
  workspace: EditorWorkspace;

  currentPath: NotePath | null;
  currentNote: Note | null;
  /** True when the active tab body diverges from the last saved version. */
  dirty: boolean;
  lastSaveError: string | null;

  openNote(path: NotePath, options?: OpenNoteOptions): Promise<void>;
  createUntitledNote(options?: CreateUntitledNoteOptions): Promise<NotePath>;
  selectTab(tabId: string): void;
  selectTabByPath(path: NotePath): void;
  closeTab(tabId?: string): void;
  closeNote(): void;
  setBody(body: string): void;
  /**
   * Replace the in-memory frontmatter with `fm` and mark the active tab dirty.
   * The existing `save()` flow serializes `frontmatter` through `ipc.saveNote`.
   */
  setFrontmatter(fm: Frontmatter): void;
  save(): Promise<void>;
  /**
   * Drop every open tab/pane and return to an empty workspace. Called when
   * the vault changes so tabs pointing at the previous vault's notes don't
   * survive the switch (they would otherwise render stale content and let
   * the user "save" into a path that no longer belongs to the open vault).
   */
  resetWorkspace(): void;
  /**
   * Called by the vault store when a watcher event reports that the
   * currently-open note changed on disk and the change was NOT initiated
   * by us (mtime newer than our last save).
   */
  _internalApplyExternalChange(path: NotePath, mtimeMs: number): void;
};

const FIRST_PANE_ID = 'pane-1';
let nextTabNumber = 1;
let nextPaneNumber = 2;

function createEmptyWorkspace(): EditorWorkspace {
  return {
    panes: [{ id: FIRST_PANE_ID, tabIds: [], activeTabId: null }],
    tabsById: {},
    activePaneId: FIRST_PANE_ID,
  };
}

function basenameTitle(path: NotePath): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/\.md$/i, '');
}

function normalizeFolderPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function joinNotePath(folder: string, filename: string): NotePath {
  const normalized = normalizeFolderPath(folder);
  return (normalized === '' ? filename : `${normalized}/${filename}`) as NotePath;
}

function activePane(workspace: EditorWorkspace): EditorPane {
  return workspace.panes.find((pane) => pane.id === workspace.activePaneId) ?? workspace.panes[0]!;
}

function activeTab(workspace: EditorWorkspace): EditorTab | null {
  const pane = activePane(workspace);
  if (pane.activeTabId === null) return null;
  return workspace.tabsById[pane.activeTabId] ?? null;
}

function legacyFromWorkspace(
  workspace: EditorWorkspace,
): Pick<EditorState, 'currentPath' | 'currentNote' | 'dirty' | 'lastSaveError'> {
  const tab = activeTab(workspace);
  return {
    currentPath: tab?.path ?? null,
    currentNote: tab?.note ?? null,
    dirty: tab?.dirty ?? false,
    lastSaveError: tab?.lastSaveError ?? null,
  };
}

function withLegacy(
  workspace: EditorWorkspace,
): Pick<EditorState, 'workspace'> &
  Pick<EditorState, 'currentPath' | 'currentNote' | 'dirty' | 'lastSaveError'> {
  return {
    workspace,
    ...legacyFromWorkspace(workspace),
  };
}

function newTab(note: Note): EditorTab {
  const id = `tab-${nextTabNumber}`;
  nextTabNumber += 1;
  return {
    id,
    path: note.path,
    title: basenameTitle(note.path),
    note,
    dirty: false,
    loading: false,
    lastSaveError: null,
  };
}

function cloneWorkspace(workspace: EditorWorkspace): EditorWorkspace {
  return {
    panes: workspace.panes.map((pane) => ({ ...pane, tabIds: [...pane.tabIds] })),
    tabsById: { ...workspace.tabsById },
    activePaneId: workspace.activePaneId,
  };
}

function findTab(
  workspace: EditorWorkspace,
  path: NotePath,
): { tabId: string; paneId: string } | null {
  for (const pane of workspace.panes) {
    for (const tabId of pane.tabIds) {
      if (workspace.tabsById[tabId]?.path === path) {
        return { tabId, paneId: pane.id };
      }
    }
  }
  return null;
}

function selectTabInWorkspace(
  workspace: EditorWorkspace,
  paneId: string,
  tabId: string,
): EditorWorkspace {
  const next = cloneWorkspace(workspace);
  next.activePaneId = paneId;
  next.panes = next.panes.map((pane) =>
    pane.id === paneId ? { ...pane, activeTabId: tabId } : pane,
  );
  return next;
}

function ensureSplitPane(workspace: EditorWorkspace): {
  workspace: EditorWorkspace;
  paneId: string;
} {
  const next = cloneWorkspace(workspace);
  if (next.panes.length >= 2) {
    const pane = next.panes[1] ?? activePane(next);
    return { workspace: next, paneId: pane.id };
  }
  const paneId = `pane-${nextPaneNumber}`;
  nextPaneNumber += 1;
  next.panes.push({ id: paneId, tabIds: [], activeTabId: null });
  return { workspace: next, paneId };
}

function placeNote(workspace: EditorWorkspace, note: Note, mode: OpenNoteMode): EditorWorkspace {
  if (mode === 'split-right' || mode === 'split-down') {
    const split = ensureSplitPane(workspace);
    const nextTab = newTab(note);
    split.workspace.tabsById[nextTab.id] = nextTab;
    split.workspace.panes = split.workspace.panes.map((pane) =>
      pane.id === split.paneId
        ? { ...pane, tabIds: [...pane.tabIds, nextTab.id], activeTabId: nextTab.id }
        : pane,
    );
    split.workspace.activePaneId = split.paneId;
    return split.workspace;
  }

  const next = cloneWorkspace(workspace);
  const pane = activePane(next);
  const paneId = pane.id;

  if (mode === 'new-tab' || pane.activeTabId === null || pane.tabIds.length === 0) {
    const nextTab = newTab(note);
    next.tabsById[nextTab.id] = nextTab;
    next.panes = next.panes.map((p) =>
      p.id === paneId ? { ...p, tabIds: [...p.tabIds, nextTab.id], activeTabId: nextTab.id } : p,
    );
    next.activePaneId = paneId;
    return next;
  }

  const tabId = pane.activeTabId;
  const current = next.tabsById[tabId];
  next.tabsById[tabId] = {
    ...(current ?? newTab(note)),
    id: tabId,
    path: note.path,
    title: basenameTitle(note.path),
    note,
    dirty: false,
    loading: false,
    lastSaveError: null,
  };
  next.activePaneId = paneId;
  return next;
}

function updateActiveTab(
  workspace: EditorWorkspace,
  updater: (tab: EditorTab) => EditorTab,
): EditorWorkspace | null {
  const tab = activeTab(workspace);
  if (tab === null) return null;
  const next = cloneWorkspace(workspace);
  next.tabsById[tab.id] = updater(tab);
  return next;
}

function activeTabMatchesLegacy(workspace: EditorWorkspace, currentPath: NotePath | null): boolean {
  const tab = activeTab(workspace);
  return tab !== null && tab.path === currentPath;
}

function removeTabFromWorkspace(workspace: EditorWorkspace, tabId: string): EditorWorkspace {
  const next = cloneWorkspace(workspace);
  delete next.tabsById[tabId];

  next.panes = next.panes.map((pane) => {
    const idx = pane.tabIds.indexOf(tabId);
    if (idx === -1) return pane;
    const tabIds = pane.tabIds.filter((id) => id !== tabId);
    let activeTabId = pane.activeTabId;
    if (activeTabId === tabId) {
      activeTabId = tabIds[Math.max(0, idx - 1)] ?? tabIds[0] ?? null;
    }
    return { ...pane, tabIds, activeTabId };
  });

  const nonEmpty = next.panes.filter((pane) => pane.tabIds.length > 0);
  if (nonEmpty.length === 0) return createEmptyWorkspace();

  next.panes = nonEmpty;
  if (!next.panes.some((pane) => pane.id === next.activePaneId)) {
    next.activePaneId = next.panes[0]!.id;
  }
  return next;
}

function uniqueUntitledPath(parentFolder: string, existingPaths: ReadonlySet<string>): NotePath {
  for (let index = 1; index < 10_000; index += 1) {
    const filename = index === 1 ? 'Senza titolo.md' : `Senza titolo ${index}.md`;
    const candidate = joinNotePath(parentFolder, filename);
    if (!existingPaths.has(candidate)) return candidate;
  }
  return joinNotePath(parentFolder, `Senza titolo ${Date.now()}.md`);
}

function existingNotePaths(workspace: EditorWorkspace): Set<string> {
  const paths = new Set<string>();
  for (const note of useVaultStore.getState().notes) {
    paths.add(note.path);
  }
  for (const tab of Object.values(workspace.tabsById)) {
    paths.add(tab.path);
  }
  return paths;
}

function defaultParentFolder(parentFolder: string | undefined): string {
  if (parentFolder !== undefined) return normalizeFolderPath(parentFolder);
  const folders = useVaultStore.getState().folders;
  return folders.includes('Inbox') ? 'Inbox' : '';
}

export const useEditorStore = create<EditorState>((set, get) => ({
  workspace: createEmptyWorkspace(),
  currentPath: null,
  currentNote: null,
  dirty: false,
  lastSaveError: null,

  async openNote(path, options = {}) {
    const mode = options.mode ?? 'replace-active';
    const reuseExisting = options.reuseExisting ?? mode === 'replace-active';
    const existing = reuseExisting ? findTab(get().workspace, path) : null;

    if (existing !== null) {
      set(withLegacy(selectTabInWorkspace(get().workspace, existing.paneId, existing.tabId)));
      return;
    }

    let note: Note;
    try {
      note = await ipc.loadNote({ path });
    } catch (err: unknown) {
      // The target can be gone (a backlink/wikilink to a since-deleted or
      // renamed note) or unreadable (locked file). Most callers fire this
      // as `void openNote(...)`, so an unsurfaced rejection would silently
      // do nothing. Surface a toast, then re-throw so callers that wrap
      // openNote in their own try/catch still see the failure.
      toast.error(ipcErrorMessage(err), 'Impossibile aprire la nota');
      throw err;
    }
    set(withLegacy(placeNote(get().workspace, note, mode)));
  },

  async createUntitledNote(options = {}) {
    const parentFolder = defaultParentFolder(options.parentFolder);
    const path = uniqueUntitledPath(parentFolder, existingNotePaths(get().workspace));
    const note = await ipc.createNote({ path, initialBody: '' });
    const mode =
      options.mode ?? (activeTab(get().workspace) === null ? 'replace-active' : 'new-tab');
    set(withLegacy(placeNote(get().workspace, note, mode)));
    await useVaultStore
      .getState()
      .refreshNotes()
      .catch(() => undefined);
    return note.path;
  },

  selectTab(tabId) {
    const workspace = get().workspace;
    for (const pane of workspace.panes) {
      if (pane.tabIds.includes(tabId)) {
        set(withLegacy(selectTabInWorkspace(workspace, pane.id, tabId)));
        return;
      }
    }
  },

  selectTabByPath(path) {
    const found = findTab(get().workspace, path);
    if (found === null) return;
    set(withLegacy(selectTabInWorkspace(get().workspace, found.paneId, found.tabId)));
  },

  closeTab(tabId) {
    const workspace = get().workspace;
    const targetId = tabId ?? activeTab(workspace)?.id;
    if (targetId === undefined) return;
    set(withLegacy(removeTabFromWorkspace(workspace, targetId)));
  },

  closeNote() {
    const workspace = get().workspace;
    const tab = activeTab(workspace);
    if (tab === null) {
      set({
        currentPath: null,
        currentNote: null,
        dirty: false,
        lastSaveError: null,
      });
      return;
    }
    set(withLegacy(removeTabFromWorkspace(workspace, tab.id)));
  },

  setBody(body) {
    const workspace = get().workspace;
    if (activeTabMatchesLegacy(workspace, get().currentPath)) {
      const next = updateActiveTab(workspace, (tab) => {
        if (tab.note === null || tab.note.content === body) return tab;
        return {
          ...tab,
          note: { ...tab.note, content: body },
          dirty: true,
        };
      });
      if (next !== null) {
        set(withLegacy(next));
        return;
      }
    }

    const note = get().currentNote;
    if (note === null || note.content === body) return;
    set({ currentNote: { ...note, content: body }, dirty: true });
  },

  setFrontmatter(fm) {
    const workspace = get().workspace;
    if (activeTabMatchesLegacy(workspace, get().currentPath)) {
      const next = updateActiveTab(workspace, (tab) => {
        if (tab.note === null) return tab;
        return {
          ...tab,
          note: { ...tab.note, frontmatter: fm },
          dirty: true,
        };
      });
      if (next !== null) {
        set(withLegacy(next));
        return;
      }
    }

    const note = get().currentNote;
    if (note === null) return;
    set({ currentNote: { ...note, frontmatter: fm }, dirty: true });
  },

  async save() {
    const workspace = get().workspace;
    const active = activeTab(workspace);
    const tab = active?.path === get().currentPath ? active : null;
    const path = tab?.path ?? get().currentPath;
    const note = tab?.note ?? get().currentNote;
    if (path === null || note === null) return;

    try {
      const { mtimeMs } = await ipc.saveNote({
        path,
        body: note.content,
        frontmatter: note.frontmatter,
      });
      if (tab !== null) {
        const next = updateActiveTab(get().workspace, (active) => ({
          ...active,
          note: active.note === null ? active.note : { ...active.note, mtimeMs },
          dirty: false,
          lastSaveError: null,
        }));
        if (next !== null) set(withLegacy(next));
      } else {
        set({
          currentNote: { ...note, mtimeMs },
          dirty: false,
          lastSaveError: null,
        });
      }
    } catch (err: unknown) {
      const message = ipcErrorMessage(err);
      const next = updateActiveTab(get().workspace, (active) => ({
        ...active,
        lastSaveError: message,
      }));
      if (next !== null) set(withLegacy(next));
      else set({ lastSaveError: message });
    }
  },

  resetWorkspace() {
    set(withLegacy(createEmptyWorkspace()));
  },

  _internalApplyExternalChange(path, mtimeMs) {
    const { currentPath, currentNote } = get();
    if (currentPath === null || currentNote === null) return;
    if (currentPath !== path) return;
    if (mtimeMs <= currentNote.mtimeMs) return;

    if (!get().dirty) {
      void get().openNote(path, { reuseExisting: false });
    } else {
      const message = 'Il file è stato modificato esternamente. Salva o ricarica per risolvere.';
      const next = updateActiveTab(get().workspace, (tab) => ({
        ...tab,
        lastSaveError: message,
      }));
      if (next !== null) set(withLegacy(next));
      else set({ lastSaveError: message });
    }
  },
}));

// Reset the editor workspace whenever the vault root changes. Without this,
// switching from vault A to vault B leaves A's tabs open: they show stale
// content and a save would write A's body back to a path that is no longer
// part of the open vault. We seed `lastVaultRoot` from the current state so
// the first subscription fire after hydration doesn't wipe a freshly-restored
// workspace. Installed module-side (mirrors the tags store) so consumers
// don't have to wire anything up.
if (typeof window !== 'undefined') {
  let lastVaultRoot: string | null = useVaultStore.getState().current?.root ?? null;

  useVaultStore.subscribe((state) => {
    const vaultRoot = state.current?.root ?? null;
    if (vaultRoot === lastVaultRoot) return;
    lastVaultRoot = vaultRoot;
    useEditorStore.getState().resetWorkspace();
  });
}
