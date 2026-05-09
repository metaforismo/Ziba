import type { NotePath } from '@synapsium/core';
import { useCallback, useState } from 'react';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { buildFolderPath, buildNotePath, replaceLastSegment } from './path-utils';

/**
 * CRUD wiring for the sidebar — extracted from `index.tsx` so the
 * orchestrator stays focused on layout + dialog routing.
 *
 * Each action:
 *   1. computes the target path,
 *   2. invokes the matching IPC channel,
 *   3. refreshes the vault listing (so the tree reflects the change
 *      immediately, ahead of the file watcher's debounced refresh),
 *   4. follows the open note when it has been moved/renamed.
 *
 * Errors surface through `window.alert` for v0.5 — same as before. A
 * future iteration can replace that with a toast surface; concentrating
 * the calls here makes that swap a one-file change.
 */
export type SidebarMutations = {
  refreshing: boolean;
  doRefresh: () => Promise<void>;
  createNoteIn: (rawName: string, parentFolder: string) => Promise<void>;
  createFolderIn: (rawName: string, parentFolder: string) => Promise<void>;
  renameFile: (oldPath: NotePath, newName: string) => Promise<void>;
  renameFolder: (oldPath: string, newName: string) => Promise<void>;
  deleteFile: (path: NotePath) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
};

export function useSidebarMutations(): SidebarMutations {
  const refreshNotes = useVaultStore((s) => s.refreshNotes);
  const currentPath = useEditorStore((s) => s.currentPath);
  const openNote = useEditorStore((s) => s.openNote);
  const closeNote = useEditorStore((s) => s.closeNote);
  const expandedFolders = useUiStore((s) => s.expandedFolders);
  const toggleFolder = useUiStore((s) => s.toggleFolder);

  const [refreshing, setRefreshing] = useState(false);

  const doRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refreshNotes();
    } finally {
      setRefreshing(false);
    }
  }, [refreshNotes]);

  const createNoteIn = useCallback(
    async (rawName: string, parentFolder: string): Promise<void> => {
      try {
        const path = buildNotePath(rawName, parentFolder);
        await ipc.createNote({ path });
        await doRefresh();
        await openNote(path);
      } catch (err: unknown) {
        window.alert(`Impossibile creare la nota: ${ipcErrorMessage(err)}`);
      }
    },
    [doRefresh, openNote],
  );

  const createFolderIn = useCallback(
    async (rawName: string, parentFolder: string): Promise<void> => {
      try {
        const path = buildFolderPath(rawName, parentFolder);
        await ipc.createFolder({ path });
        await doRefresh();
        // Auto-expand the newly created folder so the user sees it.
        if (!expandedFolders.includes(path)) toggleFolder(path);
      } catch (err: unknown) {
        window.alert(`Impossibile creare la cartella: ${ipcErrorMessage(err)}`);
      }
    },
    [doRefresh, expandedFolders, toggleFolder],
  );

  const renameFile = useCallback(
    async (oldPath: NotePath, newName: string): Promise<void> => {
      try {
        const newPath = replaceLastSegment(oldPath, newName, true);
        if (newPath === oldPath) return;
        const result = await ipc.renameNote({ from: oldPath, to: newPath });
        await doRefresh();
        if (currentPath === oldPath) {
          await openNote(result.newPath);
        }
      } catch (err: unknown) {
        window.alert(`Impossibile rinominare la nota: ${ipcErrorMessage(err)}`);
      }
    },
    [currentPath, doRefresh, openNote],
  );

  const renameFolder = useCallback(
    async (oldPath: string, newName: string): Promise<void> => {
      try {
        const newPath = replaceLastSegment(oldPath, newName, false);
        if (newPath === oldPath) return;
        await ipc.renameFolder({ from: oldPath, to: newPath });
        await doRefresh();
        // Re-resolve the open note when it lived inside the renamed folder.
        if (currentPath !== null && currentPath.startsWith(`${oldPath}/`)) {
          const remapped = newPath + currentPath.slice(oldPath.length);
          await openNote(remapped);
        }
      } catch (err: unknown) {
        window.alert(`Impossibile rinominare la cartella: ${ipcErrorMessage(err)}`);
      }
    },
    [currentPath, doRefresh, openNote],
  );

  const deleteFile = useCallback(
    async (path: NotePath): Promise<void> => {
      try {
        await ipc.deleteNote({ path });
        if (currentPath === path) closeNote();
        await doRefresh();
      } catch (err: unknown) {
        window.alert(`Impossibile eliminare la nota: ${ipcErrorMessage(err)}`);
      }
    },
    [closeNote, currentPath, doRefresh],
  );

  const deleteFolder = useCallback(
    async (path: string): Promise<void> => {
      try {
        await ipc.deleteFolder({ path });
        if (currentPath !== null && currentPath.startsWith(`${path}/`)) {
          closeNote();
        }
        await doRefresh();
      } catch (err: unknown) {
        window.alert(`Impossibile eliminare la cartella: ${ipcErrorMessage(err)}`);
      }
    },
    [closeNote, currentPath, doRefresh],
  );

  return {
    refreshing,
    doRefresh,
    createNoteIn,
    createFolderIn,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
  };
}
