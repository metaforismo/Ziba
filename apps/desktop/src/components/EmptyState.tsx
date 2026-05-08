import { useEffect } from 'react';
import type { VaultInfo } from '../../shared/ipc';
import { useVaultStore } from '../stores/vault';

type EmptyStateProps = {
  onOpenVault: () => Promise<void> | void;
};

function formatRelativeDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function EmptyState({ onOpenVault }: EmptyStateProps): JSX.Element {
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults);
  const openVault = useVaultStore((s) => s.openVault);

  useEffect(() => {
    void loadRecentVaults();
  }, [loadRecentVaults]);

  const handleOpenRecent = async (v: VaultInfo): Promise<void> => {
    await openVault(v.root);
  };

  return (
    <main className="flex h-full w-full items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-subtle p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold text-fg">Benvenuto su synapsium</h1>
        <p className="mb-6 text-sm text-fg-subtle">
          Un secondo cervello locale, basato su file Markdown. Inizia aprendo una cartella che
          diventerà il tuo vault.
        </p>

        <button
          type="button"
          onClick={(): void => {
            void onOpenVault();
          }}
          className="mb-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Apri un vault
        </button>

        <details className="mb-6 text-sm text-fg-muted">
          <summary className="cursor-pointer select-none text-fg-subtle hover:text-fg">
            Cosa è un vault?
          </summary>
          <p className="mt-2 leading-relaxed">
            Un vault è semplicemente una cartella sul tuo computer. synapsium la indicizza per
            offrire collegamenti, ricerca e backlink, ma le tue note rimangono file Markdown tuoi,
            modificabili da qualsiasi altro editor.
          </p>
        </details>

        {recentVaults.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Vault recenti
            </h2>
            <ul className="space-y-1">
              {recentVaults.map((v) => (
                <li key={v.root}>
                  <button
                    type="button"
                    onClick={(): void => {
                      void handleOpenRecent(v);
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-bg-muted"
                  >
                    <span className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium text-fg">{v.name}</span>
                      <span className="truncate text-xs text-fg-muted">{v.root}</span>
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-fg-muted">
                      {formatRelativeDate(v.openedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
