import type { NotePath } from '@synapsium/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ipc } from '../../lib/ipc';
import { buildTree } from '../../lib/tree';
import { useEditorStore } from '../../stores/editor';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { ConfirmDialog } from './ConfirmDialog';
import { FileTree, flattenTree, type TreeTarget } from './FileTree';
import { NewNoteButton } from './NewNoteButton';
import {
  buildFolderPath,
  buildNotePath,
  replaceLastSegment,
  stripMdExtension,
  validateNameSegment,
  validateRelativeNotePath,
} from './path-utils';
import { PromptDialog } from './PromptDialog';
import { TreeContextMenu } from './TreeContextMenu';

export type SidebarProps = {
  /** Optional override; defaults to opening the note via the editor store. */
  onSelectNote?: (path: NotePath) => void;
};

type ContextMenuState = {
  target: TreeTarget;
  x: number;
  y: number;
};

type DialogState =
  | { kind: 'none' }
  | {
      kind: 'newNoteIn';
      parentFolder: string;
    }
  | {
      kind: 'newFolderIn';
      parentFolder: string;
    }
  | {
      kind: 'renameFile';
      path: NotePath;
      currentName: string;
    }
  | {
      kind: 'renameFolder';
      path: string;
      currentName: string;
    }
  | {
      kind: 'deleteFile';
      path: NotePath;
      title: string;
    }
  | {
      kind: 'deleteFolder';
      path: string;
      name: string;
    };

/**
 * Real file-tree sidebar (replaces the Wave 2 stub). Composes the file
 * tree, "Nuova nota" button, context menu, and prompt/confirm dialogs.
 *
 * State coordination:
 *   - Tree data comes from `useVaultStore.notes` (refreshed via IPC).
 *   - Active highlight comes from `useEditorStore.currentPath`.
 *   - Expanded folders persist in `useUiStore.expandedFolders`.
 *   - All mutating actions (create / rename / delete) call IPC, then
 *     `refreshNotes()`. The watcher's debounced refresh would catch them
 *     too, but explicit refresh keeps the UI snappy.
 */
export function Sidebar({ onSelectNote }: SidebarProps = {}): JSX.Element {
  const notes = useVaultStore((s) => s.notes);
  const refreshNotes = useVaultStore((s) => s.refreshNotes);
  const currentPath = useEditorStore((s) => s.currentPath);
  const openNote = useEditorStore((s) => s.openNote);
  const closeNote = useEditorStore((s) => s.closeNote);
  const expandedFolders = useUiStore((s) => s.expandedFolders);
  const toggleFolder = useUiStore((s) => s.toggleFolder);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [refreshing, setRefreshing] = useState(false);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const expandedSet = useMemo(
    () => new Set(expandedFolders),
    [expandedFolders],
  );

  // Auto-expand the chain of folders that lead to the currently-open note,
  // so the active row is always visible after opening from another surface
  // (search, backlinks, etc.).
  useEffect(() => {
    if (currentPath === null) return;
    const segments = currentPath.split('/');
    segments.pop();
    if (segments.length === 0) return;
    const ancestors: string[] = [];
    let acc = '';
    for (const seg of segments) {
      acc = acc === '' ? seg : `${acc}/${seg}`;
      ancestors.push(acc);
    }
    const missing = ancestors.filter((a) => !expandedSet.has(a));
    if (missing.length > 0) {
      // Add each missing ancestor; toggleFolder is the only public API.
      for (const m of missing) {
        toggleFolder(m);
      }
    }
    // Intentionally do NOT depend on expandedSet/expandedFolders to avoid
    // re-running when the user manually collapses a folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const doRefresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refreshNotes();
    } finally {
      setRefreshing(false);
    }
  }, [refreshNotes]);

  const handleSelectFile = useCallback(
    (path: NotePath): void => {
      if (onSelectNote !== undefined) {
        onSelectNote(path);
      } else {
        void openNote(path);
      }
    },
    [onSelectNote, openNote],
  );

  const handleContextMenu = useCallback(
    (target: TreeTarget, x: number, y: number): void => {
      setContextMenu({ target, x, y });
    },
    [],
  );

  // ----- Dialog action handlers -----

  const createNoteIn = async (rawName: string, parentFolder: string): Promise<void> => {
    try {
      const path = buildNotePath(rawName, parentFolder);
      await ipc.createNote({ path });
      await doRefresh();
      await openNote(path);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile creare la nota: ${message}`);
    }
  };

  const createFolderIn = async (
    rawName: string,
    parentFolder: string,
  ): Promise<void> => {
    try {
      const path = buildFolderPath(rawName, parentFolder);
      await ipc.createFolder({ path });
      await doRefresh();
      // Auto-expand the newly created folder so the user sees it.
      if (!expandedSet.has(path)) toggleFolder(path);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile creare la cartella: ${message}`);
    }
  };

  const renameFile = async (oldPath: NotePath, newName: string): Promise<void> => {
    try {
      const newPath = replaceLastSegment(oldPath, newName, true);
      if (newPath === oldPath) return;
      const result = await ipc.renameNote({ from: oldPath, to: newPath });
      await doRefresh();
      // If we just renamed the currently-open note, follow it.
      if (currentPath === oldPath) {
        await openNote(result.newPath);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile rinominare la nota: ${message}`);
    }
  };

  const renameFolder = async (oldPath: string, newName: string): Promise<void> => {
    try {
      const newPath = replaceLastSegment(oldPath, newName, false);
      if (newPath === oldPath) return;
      await ipc.renameFolder({ from: oldPath, to: newPath });
      await doRefresh();
      // If the open note lived inside the renamed folder, re-resolve it.
      if (currentPath !== null && currentPath.startsWith(`${oldPath}/`)) {
        const remapped = newPath + currentPath.slice(oldPath.length);
        await openNote(remapped);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile rinominare la cartella: ${message}`);
    }
  };

  const deleteFile = async (path: NotePath): Promise<void> => {
    try {
      await ipc.deleteNote({ path });
      if (currentPath === path) closeNote();
      await doRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile eliminare la nota: ${message}`);
    }
  };

  const deleteFolder = async (path: string): Promise<void> => {
    try {
      await ipc.deleteFolder({ path });
      if (currentPath !== null && currentPath.startsWith(`${path}/`)) {
        closeNote();
      }
      await doRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      window.alert(`Impossibile eliminare la cartella: ${message}`);
    }
  };

  // ----- Context-menu items -----

  const buildMenuItems = useCallback(
    (target: TreeTarget): { label: string; onSelect: () => void; destructive?: boolean }[] => {
      if (target.kind === 'file') {
        return [
          { label: 'Apri', onSelect: (): void => handleSelectFile(target.path) },
          {
            label: 'Rinomina…',
            onSelect: (): void => {
              const segments = target.path.split('/');
              const last = segments[segments.length - 1] ?? target.path;
              setDialog({
                kind: 'renameFile',
                path: target.path,
                currentName: stripMdExtension(last),
              });
            },
          },
          {
            label: 'Elimina…',
            destructive: true,
            onSelect: (): void => {
              setDialog({
                kind: 'deleteFile',
                path: target.path,
                title: target.title,
              });
            },
          },
        ];
      }
      if (target.kind === 'folder') {
        return [
          {
            label: 'Nuova nota qui',
            onSelect: (): void => {
              setDialog({ kind: 'newNoteIn', parentFolder: target.path });
            },
          },
          {
            label: 'Nuova cartella qui',
            onSelect: (): void => {
              setDialog({ kind: 'newFolderIn', parentFolder: target.path });
            },
          },
          {
            label: 'Rinomina…',
            onSelect: (): void => {
              setDialog({
                kind: 'renameFolder',
                path: target.path,
                currentName: target.name,
              });
            },
          },
          {
            label: 'Elimina cartella…',
            destructive: true,
            onSelect: (): void => {
              setDialog({
                kind: 'deleteFolder',
                path: target.path,
                name: target.name,
              });
            },
          },
        ];
      }
      // Empty area
      return [
        {
          label: 'Nuova nota',
          onSelect: (): void => {
            setDialog({ kind: 'newNoteIn', parentFolder: '' });
          },
        },
        {
          label: 'Nuova cartella',
          onSelect: (): void => {
            setDialog({ kind: 'newFolderIn', parentFolder: '' });
          },
        },
      ];
    },
    [handleSelectFile],
  );

  // ----- Keyboard navigation (arrow up/down, Enter, F2, Delete) -----

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      // Ignore if any dialog or context menu is open.
      if (dialog.kind !== 'none' || contextMenu !== null) return;
      if (
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'Enter' &&
        e.key !== 'F2' &&
        e.key !== 'Delete' &&
        e.key !== 'Backspace'
      ) {
        return;
      }
      const flat = flattenTree(tree, expandedSet);
      if (flat.length === 0) return;

      const currentIdx = focusedPath === null
        ? -1
        : flat.findIndex((r) => r.path === focusedPath);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = flat[Math.min(currentIdx + 1, flat.length - 1)] ?? flat[0];
        if (next !== undefined) setFocusedPath(next.path);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = flat[Math.max(currentIdx - 1, 0)] ?? flat[0];
        if (next !== undefined) setFocusedPath(next.path);
        return;
      }

      // Below this point we need a focused row.
      if (currentIdx === -1) return;
      const row = flat[currentIdx];
      if (row === undefined) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (row.kind === 'file') {
          handleSelectFile(row.path);
        } else {
          toggleFolder(row.path);
        }
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (row.kind === 'file') {
          const segments = row.path.split('/');
          const last = segments[segments.length - 1] ?? row.path;
          setDialog({
            kind: 'renameFile',
            path: row.path,
            currentName: stripMdExtension(last),
          });
        } else {
          setDialog({
            kind: 'renameFolder',
            path: row.path,
            currentName: row.name,
          });
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (row.kind === 'file') {
          setDialog({ kind: 'deleteFile', path: row.path, title: row.title });
        } else {
          setDialog({ kind: 'deleteFolder', path: row.path, name: row.name });
        }
      }
    },
    [
      dialog.kind,
      contextMenu,
      tree,
      expandedSet,
      focusedPath,
      handleSelectFile,
      toggleFolder,
    ],
  );

  const closeDialog = (): void => setDialog({ kind: 'none' });

  return (
    <aside
      className="flex h-full flex-col overflow-hidden bg-bg-subtle"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Esplora vault"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Note
        </span>
        <NewNoteButton />
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <FileTree
          tree={tree}
          currentPath={currentPath}
          expanded={expandedSet}
          focusedPath={focusedPath}
          onToggleFolder={toggleFolder}
          onSelectFile={handleSelectFile}
          onContextMenu={handleContextMenu}
          onFocusPath={setFocusedPath}
        />
        {refreshing && (
          <div
            className="pointer-events-none absolute right-2 top-2 rounded bg-bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-muted"
            aria-live="polite"
          >
            Aggiorno…
          </div>
        )}
      </div>

      {contextMenu !== null && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu.target)}
          onClose={(): void => setContextMenu(null)}
        />
      )}

      {dialog.kind === 'newNoteIn' && (
        <PromptDialog
          title={
            dialog.parentFolder === ''
              ? 'Nuova nota'
              : `Nuova nota in ${dialog.parentFolder}`
          }
          message="Inserisci un nome. Usa `/` per creare sottocartelle."
          placeholder="nome-della-nota"
          okLabel="Crea"
          validate={validateRelativeNotePath}
          onSubmit={(value): void => {
            void createNoteIn(value, dialog.parentFolder);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === 'newFolderIn' && (
        <PromptDialog
          title={
            dialog.parentFolder === ''
              ? 'Nuova cartella'
              : `Nuova cartella in ${dialog.parentFolder}`
          }
          message="Inserisci un nome per la cartella."
          placeholder="nome-cartella"
          okLabel="Crea"
          validate={validateNameSegment}
          onSubmit={(value): void => {
            void createFolderIn(value, dialog.parentFolder);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === 'renameFile' && (
        <PromptDialog
          title="Rinomina nota"
          defaultValue={dialog.currentName}
          okLabel="Rinomina"
          validate={validateNameSegment}
          onSubmit={(value): void => {
            void renameFile(dialog.path, value);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === 'renameFolder' && (
        <PromptDialog
          title="Rinomina cartella"
          defaultValue={dialog.currentName}
          okLabel="Rinomina"
          validate={validateNameSegment}
          onSubmit={(value): void => {
            void renameFolder(dialog.path, value);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === 'deleteFile' && (
        <ConfirmDialog
          title="Elimina nota"
          message={`Vuoi davvero eliminare "${dialog.title}"? L'azione non può essere annullata.`}
          confirmLabel="Elimina"
          onConfirm={(): void => {
            void deleteFile(dialog.path);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === 'deleteFolder' && (
        <ConfirmDialog
          title="Elimina cartella"
          message={`Vuoi davvero eliminare la cartella "${dialog.name}" e tutto il suo contenuto? L'azione non può essere annullata.`}
          confirmLabel="Elimina"
          onConfirm={(): void => {
            void deleteFolder(dialog.path);
            closeDialog();
          }}
          onCancel={closeDialog}
        />
      )}
    </aside>
  );
}
