import { useState } from 'react';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { toast } from '../../stores/toast';
import { useVaultStore } from '../../stores/vault';
import { PromptDialog } from './PromptDialog';
import { buildNotePath, validateRelativeNotePath } from './path-utils';

/**
 * Sticky "Nuova nota" button at the top of the sidebar. Opens a small
 * prompt asking for a name (which can include a folder, e.g. `inbox/foo`),
 * creates the note via IPC, refreshes the index, and opens the new note
 * in the editor.
 */
export function NewNoteButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const refreshNotes = useVaultStore((s) => s.refreshNotes);
  const openNote = useEditorStore((s) => s.openNote);

  const handleSubmit = async (raw: string): Promise<void> => {
    setSubmitting(true);
    try {
      // Empty default folder = vault root, per spec.
      const notePath = buildNotePath(raw, '');
      await ipc.createNote({ path: notePath });
      await refreshNotes();
      await openNote(notePath);
      setOpen(false);
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(): void => setOpen(true)}
        disabled={submitting}
        className="rounded px-2 py-0.5 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Nuova nota
      </button>
      {open && (
        <PromptDialog
          title="Nuova nota"
          message="Inserisci un nome. Usa `/` per creare sottocartelle (es. inbox/idea)."
          placeholder="nome-della-nota"
          okLabel="Crea"
          validate={validateRelativeNotePath}
          onSubmit={(value): void => {
            void handleSubmit(value);
          }}
          onCancel={(): void => setOpen(false)}
        />
      )}
    </>
  );
}
