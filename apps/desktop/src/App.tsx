import { useEffect } from 'react';
import { EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { SearchPalette } from './components/SearchPalette';
import { ToastStack } from './components/ToastStack';
import { useEditorStore } from './stores/editor';
import { useSearchStore } from './stores/search';
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

  // Global Cmd/Ctrl+K opens the search palette. Listening on `window` so
  // the shortcut works regardless of which descendant has focus
  // (sidebar tree, editor, backlinks panel). The palette gates itself
  // on a vault being open, but we also short-circuit here to avoid
  // opening it from the empty-state screen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (current === null) return;
        e.preventDefault();
        openPalette();
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
