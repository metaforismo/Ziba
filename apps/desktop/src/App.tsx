import { useEffect, useState } from 'react';
import { EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { SearchPalette } from './components/SearchPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { ToastStack } from './components/ToastStack';
import { useEditorStore } from './stores/editor';
import { useSearchStore } from './stores/search';
import { useSemanticStore } from './stores/semantic';
import { useTagsStore } from './stores/tags';
import { useUiStore } from './stores/ui';
import { useVaultStore } from './stores/vault';
import { ipc } from './lib/ipc';
import { ipcErrorMessage } from './lib/ipc-error';
import { toast } from './stores/toast';

export function App(): JSX.Element {
  const [bootstrapped, setBootstrapped] = useState(false);
  const current = useVaultStore((s) => s.current);
  const indexProgress = useVaultStore((s) => s.indexProgress);
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
    let active = true;
    void hydrateFromMain()
      .catch((err: unknown) => {
        console.error('[ziba] bootstrap hydration failed:', err);
        toast.error(ipcErrorMessage(err), 'Non siamo riusciti a ripristinare il vault');
      })
      .finally(() => {
        if (active) setBootstrapped(true);
      });

    const offVaultEvent = ipc.onVaultEvent((event) => {
      // v1.0.1: schema-only change (someone edited a yml in
      // `<vault>/.ziba/schema/`). Skip the notes refresh — the file
      // tree didn't change — and just rebuild the taxonomy.
      if (event.type === 'schemasChanged') {
        void useTagsStore.getState().refresh();
        return;
      }
      applyVaultEvent(event);
      if (event.type === 'change' || event.type === 'add') {
        applyExternalChange(event.path, event.mtimeMs);
      }
    });

    const offIndexProgress = ipc.onIndexProgress((p) => {
      setIndexProgress(p);
    });

    // AI: keep the semantic-settings panel's status live during a pass.
    const offEmbeddingProgress = ipc.onEmbeddingProgress((p) => {
      useSemanticStore.getState().applyProgress(p);
    });

    return () => {
      active = false;
      offVaultEvent();
      offIndexProgress();
      offEmbeddingProgress();
    };
  }, [hydrateFromMain, applyVaultEvent, applyExternalChange, setIndexProgress]);

  // Global keyboard shortcuts. Listening on `window` so they fire
  // regardless of which descendant has focus (sidebar tree, editor,
  // backlinks panel). All three short-circuit on a closed vault so
  // they don't trigger from the empty-state screen.
  //
  //   - Cmd/Ctrl+K: open the search palette
  //   - Cmd/Ctrl+S: save the current note (no-op if not dirty)
  //   - Cmd/Ctrl+N: create an untitled note immediately, Obsidian-style
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
        void useEditorStore
          .getState()
          .createUntitledNote()
          .then(() => {
            useUiStore.getState().setMainView('editor');
          })
          .catch((err: unknown) => {
            toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
          });
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [current, openPalette]);

  useEffect(() => {
    if (current !== null) {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        try {
          window.scrollTo(0, 0);
        } catch {
          // jsdom exposes scrollTo but does not implement it. The direct
          // scrollTop assignments above are enough for tests and browsers.
        }
      }
    }
  }, [current]);

  if (!bootstrapped) {
    return (
      <>
        <main className="flex h-full w-full items-center justify-center bg-bg p-6">
          <div role="status" className="text-center text-sm text-fg-subtle">
            <div className="mb-2 font-medium text-fg">Apro Ziba</div>
            <div>
              {indexProgress === null
                ? 'Controllo il vault...'
                : `Indicizzo ${indexProgress.processed}${
                    indexProgress.total !== null ? `/${indexProgress.total}` : ''
                  } note...`}
            </div>
          </div>
        </main>
        <ToastStack />
      </>
    );
  }

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
      <SettingsPanel />
      <ToastStack />
    </>
  );
}
