// Shared "switch view + open note" helper.
//
// DatabaseView and GlobalGraph both need to: (1) switch the top-level
// view back to the editor, (2) load the chosen note. Doing it inline at
// each call site means duplicating the order, the error swallowing, and
// the eventual "show a toast on failure" wiring. One helper here keeps
// the behaviour identical across navigation sources, and gives us a
// single place to add a toast / surface errors when v0.4 introduces a
// notification system.

import type { NotePath } from '@synapsium/core';
import { useEditorStore } from '../stores/editor';
import { useUiStore } from '../stores/ui';

/**
 * Switch to the editor view and open the note at `path`. The view
 * change is synchronous (the editor pane mounts immediately, even
 * before the note's body has loaded) so the user feels an immediate
 * response; the load runs in the background.
 *
 * Errors from `openNote` (file deleted between query and click,
 * disk error, etc.) currently surface through `useEditorStore.lastSaveError`.
 * Once the app has a global toast system, replace the inline `console.error`
 * with a toast call.
 */
export async function navigateToNote(path: NotePath): Promise<void> {
  useUiStore.getState().setMainView('editor');
  try {
    await useEditorStore.getState().openNote(path);
  } catch (err: unknown) {
    // Don't let a failed openNote leave the renderer in a half-state.
    // The editor store already records the error; we also log so the
    // dev-mode renderer console pipe surfaces it during debugging.
    if (typeof console !== 'undefined') {
      console.error('[synapsium] navigateToNote failed for', path, err);
    }
  }
}
