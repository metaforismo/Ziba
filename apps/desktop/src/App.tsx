import { useEffect } from 'react';
import { EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { SearchPalette } from './components/SearchPalette';
import { ToastStack } from './components/ToastStack';
import { useEditorStore } from './stores/editor';
import { useSearchStore } from './stores/search';
import { useUiStore } from './stores/ui';
import { useVaultStore } from './stores/vault';
import { ipc } from './lib/ipc';

export function App(): JSX.Element {
  const current = useVaultStore((s) => s.current);
  const hydrateFromMain = useVaultStore((s) => s.hydrateFromMain);
  const applyVaultEvent = useVaultStore((s) => s.applyVaultEvent);
  const setIndexProgress = useVaultStore((s) => s.setIndexProgress);
  const pickAndOpenVault = useVaultStore((s) => s.pickAndOpenVault);
  const applyExternalChange = useEditorStore((s) => s._internalApplyExternalChange);
  const openPalette = useSearchStore((s) => s.openPalette);

  // Bootstrap: ask main for the currently-open vault, then attach push
  // listeners. Both subscriptions return unsubscribe functions, so the
  // effect cleanup detaches them on unmount / hot reload.
  useEffect(() => {
    void hydrateFromMain();

    const offVaultEvent = ipc.onVaultEvent((event) => {
      applyVaultEvent(event);
      if (event.type === 'change' || event.type === 'add') {
        applyExternalChange(event.path, event.mtimeMs);
      }
    });

    const offIndexProgress = ipc.onIndexProgress((p) => {
      setIndexProgress(p);
    });

    return () => {
      offVaultEvent();
      offIndexProgress();
    };
  }, [hydrateFromMain, applyVaultEvent, applyExternalChange, setIndexProgress]);

  // Global keyboard shortcuts. Listening on `window` so they fire
  // regardless of which descendant has focus (sidebar tree, editor,
  // backlinks panel). All three short-circuit on a closed vault so
  // they don't trigger from the empty-state screen.
  //
  //   - Cmd/Ctrl+K: open the search palette
  //   - Cmd/Ctrl+S: save the current note (no-op if not dirty)
  //   - Cmd/Ctrl+N: open the "Nuova nota" prompt
  //
  // We pull the editor / UI store actions from `getState()` inside the
  // handler so the effect deps stay stable — there's no need to
  // re-attach the listener every time `dirty` flips.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (current === null) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (key === 's') {
        // Don't intercept Cmd+Shift+S (commonly "Save as", currently
        // unused but reserved). Plain Cmd+S only.
        if (e.shiftKey || e.altKey) return;
        const editor = useEditorStore.getState();
        if (editor.currentNote === null || !editor.dirty) {
          // Still preventDefault so the browser doesn't surface the
          // "save page" dialog on the empty-state Cmd+S press.
          e.preventDefault();
          return;
        }
        e.preventDefault();
        void editor.save();
        return;
      }
      if (key === 'n') {
        if (e.shiftKey || e.altKey) return;
        e.preventDefault();
        useUiStore.getState().requestNewNotePrompt();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [current, openPalette]);

  if (current === null) {
    return (
      <>
        <EmptyState
          onOpenVault={async (): Promise<void> => {
            await pickAndOpenVault();
          }}
        />
        <ToastStack />
      </>
    );
  }

  return (
    <>
      <Layout />
      <SearchPalette />
      <ToastStack />
    </>
  );
}
