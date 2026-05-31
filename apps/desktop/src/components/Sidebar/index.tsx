import type { NotePath } from '@ziba/core';
import {
  CaretDown,
  CaretRight,
  Copy,
  Database,
  Files,
  Gear,
  Graph,
  MagnifyingGlass,
  NoteBlank,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  Trash,
} from '@phosphor-icons/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { navigateToNote } from '../../lib/navigate';
import { createStarterVault } from '../../lib/starter-vault';
import { buildTree } from '../../lib/tree';
import { useEditorStore } from '../../stores/editor';
import { useSearchStore } from '../../stores/search';
import { useTagsStore } from '../../stores/tags';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { FileTree, flattenTree, type TreeTarget } from './FileTree';
import { FolderIconPicker } from './FolderIconPicker';
import { NewNoteButton } from './NewNoteButton';
import { stripMdExtension } from './path-utils';
import { SidebarDialogs, type DialogState } from './SidebarDialogs';
import { TagsSection } from './TagsSection';
import { TypesSection } from './TypesSection';
import { TreeContextMenu } from './TreeContextMenu';
import type { ContextMenuItem } from './TreeContextMenu';
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

type FolderIconPickerState = {
  path: string;
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
  const folders = useVaultStore((s) => s.folders);
  const currentVault = useVaultStore((s) => s.current);
  const currentPath = useEditorStore((s) => s.currentPath);
  const openNote = useEditorStore((s) => s.openNote);
  const createUntitledNote = useEditorStore((s) => s.createUntitledNote);
  const expandedFolders = useUiStore((s) => s.expandedFolders);
  const toggleFolder = useUiStore((s) => s.toggleFolder);
  const mainView = useUiStore((s) => s.mainView);
  const setMainView = useUiStore((s) => s.setMainView);
  const folderIconsByVault = useUiStore((s) => s.folderIconsByVault);
  const setFolderIcon = useUiStore((s) => s.setFolderIcon);
  const resetFolderIcon = useUiStore((s) => s.resetFolderIcon);
  const openPalette = useSearchStore((s) => s.openPalette);
  // Either a tag OR a type filter (mutually exclusive — see
  // useTagsStore docstring) restricts the file tree to a subset of
  // visible notes. The filter happens here (rather than as FileTree
  // prop) so the tree component stays a pure visualizer and the
  // taxonomy store stays the single source of truth for "which paths
  // are visible".
  const selectedTag = useTagsStore((s) => s.selectedTag);
  const selectedType = useTagsStore((s) => s.selectedType);
  const notesForSelectedTag = useTagsStore((s) => s.notesForSelectedTag);
  const notesForSelectedType = useTagsStore((s) => s.notesForSelectedType);
  const clearSelectedTag = useTagsStore((s) => s.selectTag);
  const clearSelectedType = useTagsStore((s) => s.selectType);

  const mutations = useSidebarMutations();
  const { refreshing } = mutations;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [folderIconPicker, setFolderIconPicker] = useState<FolderIconPickerState | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [starterCreating, setStarterCreating] = useState(false);

  const visibleNotes = useMemo(() => {
    // Tag wins if active. Type wins next. Otherwise show everything.
    // Mutual exclusion enforced upstream means at most one is non-null.
    if (selectedTag !== null) {
      const allowed = new Set(notesForSelectedTag.map((n) => n.path));
      return notes.filter((n) => allowed.has(n.path));
    }
    if (selectedType !== null) {
      const allowed = new Set(notesForSelectedType.map((n) => n.path));
      return notes.filter((n) => allowed.has(n.path));
    }
    return notes;
  }, [notes, selectedTag, selectedType, notesForSelectedTag, notesForSelectedType]);

  const visibleFolders = useMemo(
    () => (selectedTag === null && selectedType === null ? folders : []),
    [folders, selectedTag, selectedType],
  );
  const tree = useMemo(
    () => buildTree(visibleNotes, visibleFolders),
    [visibleNotes, visibleFolders],
  );
  const expandedSet = useMemo(() => new Set(expandedFolders), [expandedFolders]);
  const folderIcons = currentVault === null ? {} : (folderIconsByVault[currentVault.root] ?? {});
  // Pre-flattened row list shared between <FileTree> and the keyboard
  // handler. One walk per tree mutation instead of one per keystroke
  // — matters at vault scale (~1000+ notes) where the recursive walk
  // is no longer free.
  const flatRows = useMemo(() => flattenTree(tree, expandedSet), [tree, expandedSet]);

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

  const handleSelectFile = useCallback(
    (path: NotePath): void => {
      if (onSelectNote !== undefined) {
        onSelectNote(path);
      } else {
        void navigateToNote(path);
      }
    },
    [onSelectNote],
  );

  const handleContextMenu = useCallback((target: TreeTarget, x: number, y: number): void => {
    setContextMenu({ target, x, y });
  }, []);

  const handleCreateStarter = useCallback(async (): Promise<void> => {
    setStarterCreating(true);
    try {
      await createStarterVault();
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la struttura iniziale');
    } finally {
      setStarterCreating(false);
    }
  }, []);

  // ----- Context-menu items -----

  const copyPath = useCallback((path: string): void => {
    void navigator.clipboard?.writeText(path);
  }, []);

  const absolutePathFor = useCallback(
    (path: string): string => {
      const root = currentVault?.root ?? '';
      if (root === '') return path;
      return `${root.replace(/[\\/]+$/, '')}/${path}`;
    },
    [currentVault?.root],
  );

  const showInFinder = useCallback(async (path: string): Promise<void> => {
    try {
      await ipc.showInFinder({ path });
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile mostrare in Finder');
    }
  }, []);

  const createUntitledIn = useCallback(
    async (parentFolder: string): Promise<void> => {
      try {
        await createUntitledNote({ parentFolder });
        setMainView('editor');
      } catch (err: unknown) {
        toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
      }
    },
    [createUntitledNote, setMainView],
  );

  const buildMenuItems = useCallback(
    (target: TreeTarget): ContextMenuItem[] => {
      if (target.kind === 'file') {
        return [
          {
            label: 'Apri',
            icon: <NoteBlank size={15} />,
            onSelect: (): void => handleSelectFile(target.path),
          },
          {
            label: 'Apri in nuova tab',
            icon: <NoteBlank size={15} />,
            onSelect: (): void => {
              setMainView('editor');
              void openNote(target.path, { mode: 'new-tab', reuseExisting: true });
            },
          },
          {
            label: 'Duplica',
            icon: <Files size={15} />,
            onSelect: (): void => {
              void mutations.duplicateFile(target.path);
            },
          },
          {
            label: 'Copia percorso',
            icon: <Copy size={15} />,
            children: [
              {
                label: 'Percorso relativo',
                onSelect: (): void => copyPath(target.path),
              },
              {
                label: 'Percorso assoluto',
                onSelect: (): void => copyPath(absolutePathFor(target.path)),
              },
            ],
          },
          {
            label: 'Mostra in Finder',
            separatorBefore: true,
            onSelect: (): void => {
              void showInFinder(target.path);
            },
          },
          {
            label: 'Rinomina',
            icon: <PencilSimple size={15} />,
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
            label: 'Elimina',
            icon: <Trash size={15} />,
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
            icon: <Plus size={15} />,
            onSelect: (): void => {
              void createUntitledIn(target.path);
            },
          },
          {
            label: 'Nuova cartella qui',
            icon: <Plus size={15} />,
            onSelect: (): void => {
              setDialog({ kind: 'newFolderIn', parentFolder: target.path });
            },
          },
          {
            label: 'Copia percorso',
            icon: <Copy size={15} />,
            children: [
              { label: 'Percorso relativo', onSelect: (): void => copyPath(target.path) },
              {
                label: 'Percorso assoluto',
                onSelect: (): void => copyPath(absolutePathFor(target.path)),
              },
            ],
          },
          {
            label: 'Mostra in Finder',
            onSelect: (): void => {
              void showInFinder(target.path);
            },
          },
          {
            label: 'Cambia icona',
            separatorBefore: true,
            onSelect: (): void => {
              setFolderIconPicker({
                path: target.path,
                x: contextMenu?.x ?? 0,
                y: contextMenu?.y ?? 0,
              });
            },
          },
          {
            label: 'Rinomina',
            icon: <PencilSimple size={15} />,
            onSelect: (): void => {
              setDialog({
                kind: 'renameFolder',
                path: target.path,
                currentName: target.name,
              });
            },
          },
          {
            label: 'Elimina',
            icon: <Trash size={15} />,
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
          icon: <Plus size={15} />,
          onSelect: (): void => {
            void createUntitledIn('');
          },
        },
        {
          label: 'Nuova cartella',
          icon: <Plus size={15} />,
          onSelect: (): void => {
            setDialog({ kind: 'newFolderIn', parentFolder: '' });
          },
        },
      ];
    },
    [
      absolutePathFor,
      contextMenu?.x,
      contextMenu?.y,
      copyPath,
      createUntitledIn,
      handleSelectFile,
      mutations,
      openNote,
      setMainView,
      showInFinder,
    ],
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
      if (flatRows.length === 0) return;

      const currentIdx =
        focusedPath === null ? -1 : flatRows.findIndex((r) => r.path === focusedPath);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = flatRows[Math.min(currentIdx + 1, flatRows.length - 1)] ?? flatRows[0];
        if (next !== undefined) setFocusedPath(next.path);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = flatRows[Math.max(currentIdx - 1, 0)] ?? flatRows[0];
        if (next !== undefined) setFocusedPath(next.path);
        return;
      }

      // Below this point we need a focused row.
      if (currentIdx === -1) return;
      const row = flatRows[currentIdx];
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
    [dialog.kind, contextMenu, flatRows, focusedPath, handleSelectFile, toggleFolder],
  );

  const closeDialog = useCallback((): void => setDialog({ kind: 'none' }), []);

  return (
    <aside
      className="flex h-full flex-col overflow-hidden border-r border-border bg-bg-subtle"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Esplora vault"
    >
      <div className="shrink-0 px-3 pb-2 pt-3">
        <div className="flex min-h-8 items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-fg">Note</span>
          <div className="flex items-center gap-0.5">
            <NewNoteButton />
            <button
              type="button"
              aria-label="Cerca note"
              title="Cerca note"
              onClick={openPalette}
              className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <MagnifyingGlass size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
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

      {selectedType !== null && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-bg-muted/40 px-3 py-1.5 text-xs text-fg-subtle">
          <span className="truncate">
            Tipo <span className="font-mono text-fg">{selectedType}</span>
          </span>
          <button
            type="button"
            onClick={(): void => {
              void clearSelectedType(null);
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle hover:bg-bg-muted hover:text-fg"
          >
            Mostra tutti i file
          </button>
        </div>
      )}

      <div className="relative flex-1 overflow-y-auto border-t border-border/70 pt-2">
        <FileTree
          rows={flatRows}
          currentPath={currentPath}
          focusedPath={focusedPath}
          folderIcons={folderIcons}
          onCreateStarter={
            flatRows.length === 0 ? (): void => void handleCreateStarter() : undefined
          }
          starterCreating={starterCreating}
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

      <div className="shrink-0 border-t border-border bg-bg-subtle">
        <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          Strumenti
        </div>
        <div className="space-y-0.5 px-2 py-2">
          <ToolButton
            label="Grafo"
            active={mainView === 'graph'}
            icon={<Graph size={16} aria-hidden="true" />}
            onClick={(): void => setMainView('graph')}
          />
          <ToolButton
            label="Database"
            active={mainView === 'database'}
            icon={<Database size={16} aria-hidden="true" />}
            onClick={(): void => setMainView('database')}
          />
          <ToolButton
            label="Organizza"
            active={organizeOpen}
            icon={<SlidersHorizontal size={16} aria-hidden="true" />}
            trailing={
              organizeOpen ? (
                <CaretDown size={13} aria-hidden="true" />
              ) : (
                <CaretRight size={13} aria-hidden="true" />
              )
            }
            onClick={(): void => setOrganizeOpen((open) => !open)}
          />
        </div>
        {organizeOpen && (
          <div className="max-h-[38vh] overflow-y-auto border-t border-border bg-bg">
            <TypesSection />
            <TagsSection />
          </div>
        )}
        <div className="border-t border-border px-2 py-2">
          <ToolButton
            label="Impostazioni"
            active={false}
            disabled
            icon={<Gear size={16} aria-hidden="true" />}
          />
        </div>
      </div>

      {contextMenu !== null && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildMenuItems(contextMenu.target)}
          onClose={(): void => setContextMenu(null)}
        />
      )}

      {folderIconPicker !== null && currentVault !== null && (
        <FolderIconPicker
          x={folderIconPicker.x}
          y={folderIconPicker.y}
          value={folderIcons[folderIconPicker.path] ?? 'folder'}
          onSelect={(iconId): void =>
            setFolderIcon(currentVault.root, folderIconPicker.path, iconId)
          }
          onReset={(): void => resetFolderIcon(currentVault.root, folderIconPicker.path)}
          onClose={(): void => setFolderIconPicker(null)}
        />
      )}

      <SidebarDialogs dialog={dialog} mutations={mutations} onClose={closeDialog} />
    </aside>
  );
}

function ToolButton({
  label,
  active,
  disabled = false,
  icon,
  trailing,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  icon: JSX.Element;
  trailing?: JSX.Element;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-disabled={disabled ? true : undefined}
      disabled={disabled}
      onClick={onClick}
      className={
        'flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium ' +
        (active
          ? 'bg-bg-muted text-fg'
          : disabled
            ? 'cursor-not-allowed text-fg-muted/65'
            : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
      }
    >
      <span className="inline-flex size-5 shrink-0 items-center justify-center text-current">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {trailing !== undefined && (
        <span className="ml-auto inline-flex shrink-0 text-fg-muted">{trailing}</span>
      )}
    </button>
  );
}
