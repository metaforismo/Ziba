// Shared "switch view + open note" helper.
//
// DatabaseView and GlobalGraph both need to: (1) switch the top-level
// view back to the editor, (2) load the chosen note. One helper keeps
// the behaviour identical across navigation sources and gives us a
// single place to surface errors via the global toast store.

import type { NotePath } from '@ziba/core';
import { ipcErrorMessage } from './ipc-error';
import { useEditorStore } from '../stores/editor';
import { toast } from '../stores/toast';
import { useUiStore } from '../stores/ui';

/**
 * Switch to the editor view and open the note at `path`. The view
 * change is synchronous (the editor pane mounts immediately, even
 * before the note's body has loaded) so the user feels an immediate
 * response; the load runs in the background.
 *
 * On `openNote` failure (file deleted between query and click, disk
 * error, vault closed mid-flight), the editor store records the error
 * for inline display, and we also surface a toast — the call sites
 * (table click, graph node click) no longer have a natural inline
 * surface for the failure since the user just left their previous
 * context.
 */
export async function navigateToNote(path: NotePath): Promise<void> {
  useUiStore.getState().setMainView('editor');
  try {
    await useEditorStore.getState().openNote(path);
  } catch (err: unknown) {
    console.error('[ziba] navigateToNote failed for', path, err);
    toast.error(ipcErrorMessage(err), 'Apertura nota fallita');
  }
}
