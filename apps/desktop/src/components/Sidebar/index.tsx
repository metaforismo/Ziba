import type { NotePath } from '@synapsium/core';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTree } from '../../lib/tree';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore } from '../../stores/tags';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { FileTree, flattenTree, type TreeTarget } from './FileTree';
import { NewNoteButton } from './NewNoteButton';
import { stripMdExtension } from './path-utils';
import { SidebarDialogs, type DialogState } from './SidebarDialogs';
import { TagsSection } from './TagsSection';
import { TreeContextMenu } from './TreeContextMenu';
import { useSidebarMutations } from './useSidebarMutations';

export type SidebarProps = {
  /** Optional override; defaults to opening the note via the editor store. */
  onSelectNote?: (path: NotePath) => void;
};

type ContextMenuState = {
  target: TreeTarget;
  x: number;
  y: number;
};

/**
 * Real file-tree sidebar (replaces the Wave 2 stub). Composes the file
 * tree, "Nuova nota" button, context menu, and prompt/confirm dialogs.
 *
 * State coordination:
 *   - Tree data comes from `useVaultStore.notes` (refreshed via IPC).
 *   - Active highlight comes from `useEditorStore.currentPath`.
 *   - Expanded folders persist in `useUiStore.expandedFolders`.
 *   - All mutating actions live in `useSidebarMutations`. The dialogs
 *     they open are rendered by `<SidebarDialogs>`. This file is just
 *     the orchestrator: layout, tree filtering, keyboard nav, context
 *     menu wiring.
 */
export function Sidebar({ onSelectNote }: SidebarProps = {}): JSX.Element {
  const notes = useVaultStore((s) => s.notes);
  const currentPath = useEditorStore((s) => s.currentPath);
  const expandedFolders = useUiStore((s) => s.expandedFolders);
  const toggleFolder = useUiStore((s) => s.toggleFolder);
  // When a tag is selected, the file tree filters to only the notes that
  // contain it. The filter happens here (rather than as a FileTree prop)
  // so the tree component stays a pure visualizer and the tag store
  // stays the single source of truth for "which paths are visible".
  const selectedTag = useTagsStore((s) => s.selectedTag);
  const notesForSelectedTag = useTagsStore((s) => s.notesForSelectedTag);
  const clearSelectedTag = useTagsStore((s) => s.selectTag);

  const mutations = useSidebarMutations();
  const { refreshing } = mutations;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const visibleNotes = useMemo(() => {
    if (selectedTag === null) return notes;
    const allowed = new Set(notesForSelectedTag.map((n) => n.path));
    return notes.filter((n) => allowed.has(n.path));
  }, [notes, selectedTag, notesForSelectedTag]);

  const tree = useMemo(() => buildTree(visibleNotes), [visibleNotes]);
  const expandedSet = useMemo(() => new Set(expandedFolders), [expandedFolders]);

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
      for (const m of missing) {
        toggleFolder(m);
      }
    }
    // Intentionally do NOT depend on expandedSet/expandedFolders to avoid
    // re-running when the user manually collapses a folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const openNote = useEditorStore((s) => s.openNote);
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

  const handleContextMenu = useCallback((target: TreeTarget, x: number, y: number): void => {
    setContextMenu({ target, x, y });
  }, []);

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

      const currentIdx = focusedPath === null ? -1 : flat.findIndex((r) => r.path === focusedPath);

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
    [dialog.kind, contextMenu, tree, expandedSet, focusedPath, handleSelectFile, toggleFolder],
  );

  const closeDialog = useCallback((): void => setDialog({ kind: 'none' }), []);

  return (
    <aside
      className="flex h-full flex-col overflow-hidden bg-bg-subtle"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Esplora vault"
    >
      <TagsSection />

      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Note</span>
        <NewNoteButton />
      </div>

      {selectedTag !== null && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-muted/40 px-3 py-1.5 text-xs text-fg-subtle">
          <span className="truncate">
            Filtrato per <span className="font-mono text-fg">#{selectedTag}</span>
          </span>
          <button
            type="button"
            onClick={(): void => {
              void clearSelectedTag(null);
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle hover:bg-bg-muted hover:text-fg"
          >
            Mostra tutti i file
          </button>
        </div>
      )}

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

      <SidebarDialogs dialog={dialog} mutations={mutations} onClose={closeDialog} />
    </aside>
  );
}
