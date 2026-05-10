import { useState } from 'react';
import { ipc } from '../../lib/ipc';
import { ipcErrorMessage } from '../../lib/ipc-error';
import { useEditorStore } from '../../stores/editor';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { useVaultStore } from '../../stores/vault';
import { PromptDialog } from './PromptDialog';
import { buildNotePath, validateRelativeNotePath } from './path-utils';

/**
 * Sticky "Nuova nota" button at the top of the sidebar. Opens a small
 * prompt asking for a name (which can include a folder, e.g. `inbox/foo`),
 * creates the note via IPC, refreshes the index, and opens the new note
 * in the editor.
 *
 * The dialog can also be opened externally via
 * `useUiStore.getState().requestNewNotePrompt()` — used by the
 * Cmd/Ctrl+N global shortcut. We mirror that flag into local state so
 * the dialog still owns its own open/close lifecycle (close on submit,
 * close on cancel, close on Esc) without re-entering through the store.
 */
export function NewNoteButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const refreshNotes = useVaultStore((s) => s.refreshNotes);
  const openNote = useEditorStore((s) => s.openNote);
  const newNotePromptOpen = useUiStore((s) => s.newNotePromptOpen);
  const closeNewNotePrompt = useUiStore((s) => s.closeNewNotePrompt);

  // Externally-driven open: when the UI store flips the flag (Cmd+N
  // shortcut), open the dialog and clear the flag so re-pressing the
  // shortcut after manual close re-opens it.
  if (newNotePromptOpen && !open) {
    setOpen(true);
    closeNewNotePrompt();
  }

  const handleClose = (): void => {
    setOpen(false);
    // Belt-and-braces: in case the flag was set after our local open
    // but before we cleared it, make sure it's down on close too.
    closeNewNotePrompt();
  };

  const handleSubmit = async (raw: string): Promise<void> => {
    setSubmitting(true);
    try {
      // Empty default folder = vault root, per spec.
      const notePath = buildNotePath(raw, '');
      await ipc.createNote({ path: notePath });
      await refreshNotes();
      await openNote(notePath);
      handleClose();
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
          onCancel={handleClose}
        />
      )}
    </>
  );
}
