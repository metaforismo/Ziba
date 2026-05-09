import type { JSX } from 'react';
import type { NotePath } from '@ziba/core';
import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';
import { validateNameSegment, validateRelativeNotePath } from './path-utils';
import type { SidebarMutations } from './useSidebarMutations';

/**
 * Sidebar dialog state machine. Encodes the six modal flows the user
 * can reach (create note / folder, rename note / folder, delete
 * note / folder) plus a `none` resting state. Co-located with the
 * dispatching component so the "open dialog" sites stay literal.
 */
export type DialogState =
  | { kind: 'none' }
  | { kind: 'newNoteIn'; parentFolder: string }
  | { kind: 'newFolderIn'; parentFolder: string }
  | { kind: 'renameFile'; path: NotePath; currentName: string }
  | { kind: 'renameFolder'; path: string; currentName: string }
  | { kind: 'deleteFile'; path: NotePath; title: string }
  | { kind: 'deleteFolder'; path: string; name: string };

type Props = {
  dialog: DialogState;
  mutations: SidebarMutations;
  onClose: () => void;
};

/**
 * Renders the dialog matching the active `DialogState`. Submit handlers
 * dispatch the matching mutation and then call `onClose` so the caller
 * doesn't have to track which dialog is up.
 *
 * Pulled out of `Sidebar/index.tsx` so the orchestrator (~250 lines
 * after the split) doesn't have to read like a switch on six dialog
 * shapes — keeps each view in one place.
 */
export function SidebarDialogs({ dialog, mutations, onClose }: Props): JSX.Element | null {
  switch (dialog.kind) {
    case 'none':
      return null;

    case 'newNoteIn':
      return (
        <PromptDialog
          title={dialog.parentFolder === '' ? 'Nuova nota' : `Nuova nota in ${dialog.parentFolder}`}
          message="Inserisci un nome. Usa `/` per creare sottocartelle."
          placeholder="nome-della-nota"
          okLabel="Crea"
          validate={validateRelativeNotePath}
          onSubmit={(value): void => {
            void mutations.createNoteIn(value, dialog.parentFolder);
            onClose();
          }}
          onCancel={onClose}
        />
      );

    case 'newFolderIn':
      return (
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
            void mutations.createFolderIn(value, dialog.parentFolder);
            onClose();
          }}
          onCancel={onClose}
        />
      );

    case 'renameFile':
      return (
        <PromptDialog
          title="Rinomina nota"
          defaultValue={dialog.currentName}
          okLabel="Rinomina"
          validate={validateNameSegment}
          onSubmit={(value): void => {
            void mutations.renameFile(dialog.path, value);
            onClose();
          }}
          onCancel={onClose}
        />
      );

    case 'renameFolder':
      return (
        <PromptDialog
          title="Rinomina cartella"
          defaultValue={dialog.currentName}
          okLabel="Rinomina"
          validate={validateNameSegment}
          onSubmit={(value): void => {
            void mutations.renameFolder(dialog.path, value);
            onClose();
          }}
          onCancel={onClose}
        />
      );

    case 'deleteFile':
      return (
        <ConfirmDialog
          title="Elimina nota"
          message={`Vuoi davvero eliminare "${dialog.title}"? L'azione non può essere annullata.`}
          confirmLabel="Elimina"
          onConfirm={(): void => {
            void mutations.deleteFile(dialog.path);
            onClose();
          }}
          onCancel={onClose}
        />
      );

    case 'deleteFolder':
      return (
        <ConfirmDialog
          title="Elimina cartella"
          message={`Vuoi davvero eliminare la cartella "${dialog.name}" e tutto il suo contenuto? L'azione non può essere annullata.`}
          confirmLabel="Elimina"
          onConfirm={(): void => {
            void mutations.deleteFolder(dialog.path);
            onClose();
          }}
          onCancel={onClose}
        />
      );
  }
}
