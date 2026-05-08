import { useEffect } from 'react';
import { EmptyState } from './components/EmptyState';
import { Layout } from './components/Layout';
import { useEditorStore } from './stores/editor';
import { useVaultStore } from './stores/vault';
import { ipc } from './lib/ipc';

export function App(): JSX.Element {
  const current = useVaultStore((s) => s.current);
  const hydrateFromMain = useVaultStore((s) => s.hydrateFromMain);
  const applyVaultEvent = useVaultStore((s) => s.applyVaultEvent);
  const setIndexProgress = useVaultStore((s) => s.setIndexProgress);
  const pickAndOpenVault = useVaultStore((s) => s.pickAndOpenVault);
  const applyExternalChange = useEditorStore(
    (s) => s._internalApplyExternalChange,
  );

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

  if (current === null) {
    return (
      <EmptyState
        onOpenVault={async (): Promise<void> => {
          await pickAndOpenVault();
        }}
      />
    );
  }

  return <Layout />;
}
