import type { NotePath } from '@ziba/core';
import { useCallback, useState } from 'react';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { buildFolderPath, buildNotePath, replaceLastSegment } from './path-utils';

/**
 * CRUD wiring for the sidebar — extracted from `index.tsx` so the
 * orchestrator stays focused on layout + dialog routing.
 *
 * Each action is a two-stage flow:
 *   1. **IPC stage** — the actual mutation (createNote / renameFolder /
 *      deleteFile / …). A failure here is what the user is asking
 *      about: we surface "Impossibile <verb>" and stop.
 *   2. **Follow-up stage** — refresh the vault listing and (when
 *      relevant) re-open or close the active note. These can fail
 *      independently of the IPC; if they do, the IPC has already
 *      succeeded so we *must not* tell the user the operation failed.
 *      We log + show a non-blocking "Aggiornamento incompleto" alert
 *      so the user knows to refresh manually if needed.
 *
 * This split matters: a previous shape with a single try/catch around
 * both stages would mis-report a stuck file watcher (refresh failure)
 * as "Impossibile eliminare la nota" — but the file *was* deleted, the
 * user just sees a stale tree. The narrow scope keeps the message
 * truthful.
 *
 * Errors surface through the global toast store (`stores/toast.ts`):
 * the IPC stage uses an error toast, the follow-up stage uses a
 * warning toast. Tests can drain `useToastStore.getState().toasts`
 * to assert on what the user would see.
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

/**
 * Run a vault-state synchronisation step (refresh + optional follow-up
 * action like re-opening a renamed note) without letting its failure
 * masquerade as the parent IPC operation having failed.
 *
 * The IPC operation has already succeeded by the time this is called;
 * an exception here means "the on-disk state changed but the in-app
 * view didn't catch up". The user needs to know but mustn't be told
 * the original action failed.
 */
async function runFollowUp(verb: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: unknown) {
    console.error(`[sidebar] follow-up after ${verb} failed:`, err);
    toast.warning(
      `${verb} riuscito ma l'aggiornamento della vista è fallito (${ipcErrorMessage(
        err,
      )}). Premi F5 per ricaricare.`,
      'Aggiornamento incompleto',
    );
  }
}

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
      const path = buildNotePath(rawName, parentFolder);
      try {
        await ipc.createNote({ path });
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
        return;
      }
      await runFollowUp('Creazione nota', async () => {
        await doRefresh();
        await openNote(path);
      });
    },
    [doRefresh, openNote],
  );

  const createFolderIn = useCallback(
    async (rawName: string, parentFolder: string): Promise<void> => {
      const path = buildFolderPath(rawName, parentFolder);
      try {
        await ipc.createFolder({ path });
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile creare la cartella');
        return;
      }
      await runFollowUp('Creazione cartella', async () => {
        await doRefresh();
        // Auto-expand the newly created folder so the user sees it.
        if (!expandedFolders.includes(path)) toggleFolder(path);
      });
    },
    [doRefresh, expandedFolders, toggleFolder],
  );

  const renameFile = useCallback(
    async (oldPath: NotePath, newName: string): Promise<void> => {
      const newPath = replaceLastSegment(oldPath, newName, true);
      if (newPath === oldPath) return;
      let resultNewPath: NotePath;
      try {
        const result = await ipc.renameNote({ from: oldPath, to: newPath });
        resultNewPath = result.newPath;
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile rinominare la nota');
        return;
      }
      await runFollowUp('Rinomina nota', async () => {
        await doRefresh();
        if (currentPath === oldPath) {
          await openNote(resultNewPath);
        }
      });
    },
    [currentPath, doRefresh, openNote],
  );

  const renameFolder = useCallback(
    async (oldPath: string, newName: string): Promise<void> => {
      const newPath = replaceLastSegment(oldPath, newName, false);
      if (newPath === oldPath) return;
      try {
        await ipc.renameFolder({ from: oldPath, to: newPath });
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile rinominare la cartella');
        return;
      }
      await runFollowUp('Rinomina cartella', async () => {
        await doRefresh();
        // Re-resolve the open note when it lived inside the renamed folder.
        if (currentPath !== null && currentPath.startsWith(`${oldPath}/`)) {
          const remapped = newPath + currentPath.slice(oldPath.length);
          await openNote(remapped);
        }
      });
    },
    [currentPath, doRefresh, openNote],
  );

  const deleteFile = useCallback(
    async (path: NotePath): Promise<void> => {
      try {
        await ipc.deleteNote({ path });
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile eliminare la nota');
        return;
      }
      await runFollowUp('Eliminazione nota', async () => {
        if (currentPath === path) closeNote();
        await doRefresh();
      });
    },
    [closeNote, currentPath, doRefresh],
  );

  const deleteFolder = useCallback(
    async (path: string): Promise<void> => {
      try {
        await ipc.deleteFolder({ path });
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile eliminare la cartella');
        return;
      }
      await runFollowUp('Eliminazione cartella', async () => {
        if (currentPath !== null && currentPath.startsWith(`${path}/`)) {
          closeNote();
        }
        await doRefresh();
      });
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
