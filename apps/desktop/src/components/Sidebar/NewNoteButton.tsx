import { NotePencil } from '@phosphor-icons/react';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';

function parentFolderFromPath(path: string | null): string | undefined {
  if (path === null || !path.includes('/')) return undefined;
  return path.split('/').slice(0, -1).join('/');
}

/**
 * Sticky "Nuova nota" button at the top of the sidebar. Obsidian-style:
 * no naming dialog, just create `Senza titolo.md` in context and focus it.
 */
export function NewNoteButton(): JSX.Element {
  const currentPath = useEditorStore((s) => s.currentPath);
  const createUntitledNote = useEditorStore((s) => s.createUntitledNote);
  const setMainView = useUiStore((s) => s.setMainView);

  const handleCreate = async (): Promise<void> => {
    try {
      const parentFolder = parentFolderFromPath(currentPath);
      await createUntitledNote(parentFolder === undefined ? {} : { parentFolder });
      setMainView('editor');
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
    }
  };

  return (
    <button
      type="button"
      aria-label="Nuova nota"
      title="Nuova nota"
      onClick={(): void => {
        void handleCreate();
      }}
      className="inline-flex size-7 items-center justify-center rounded-md bg-bg text-fg-subtle shadow-sm hover:bg-bg-muted hover:text-fg"
    >
      <NotePencil size={16} aria-hidden="true" />
    </button>
  );
}
