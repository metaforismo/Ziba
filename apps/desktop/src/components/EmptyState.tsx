import { useState } from 'react';
import {
  ArrowRight,
  ClockCounterClockwise,
  FileText,
  FolderOpen,
  Graph,
  MagnifyingGlass,
  WarningCircle,
} from '@phosphor-icons/react';
import type { VaultInfo } from '../../shared/ipc';
import { useVaultStore } from '../stores/vault';

type EmptyStateProps = {
  onOpenVault: () => Promise<VaultInfo | null | void> | VaultInfo | null | void;
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
  const [primaryOpening, setPrimaryOpening] = useState(false);
  const [openingRecentRoot, setOpeningRecentRoot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const openVault = useVaultStore((s) => s.openVault);

  const busy = primaryOpening || openingRecentRoot !== null;

  const showOpenError = (): void => {
    setError('Non siamo riusciti ad aprire il vault. Controlla che la cartella esista e riprova.');
  };

  const handlePrimaryOpen = async (): Promise<void> => {
    setError(null);
    setPrimaryOpening(true);
    try {
      await onOpenVault();
    } catch {
      showOpenError();
    } finally {
      setPrimaryOpening(false);
    }
  };

  const handleOpenRecent = async (v: VaultInfo): Promise<void> => {
    setError(null);
    setOpeningRecentRoot(v.root);
    try {
      await openVault(v.root);
    } catch {
      showOpenError();
    } finally {
      setOpeningRecentRoot(null);
    }
  };

  return (
    <main className="flex h-full w-full overflow-auto bg-[#f6f1e9] text-fg dark:bg-bg lg:overflow-hidden">
      <section className="relative grid min-h-full w-full grid-cols-1 lg:grid-cols-[minmax(320px,0.86fr)_minmax(520px,1.14fr)]">
        <div className="flex min-h-0 flex-col justify-center px-7 py-8 sm:px-10 lg:px-14">
          <div className="max-w-xl">
            <div className="mb-8 inline-flex items-center gap-2 rounded-md border border-[#ded5c8] bg-white/55 px-2.5 py-1.5 text-xs font-medium text-fg-subtle shadow-sm dark:border-border dark:bg-bg-subtle">
              <FolderOpen size={15} aria-hidden="true" weight="duotone" />
              Note locali in Markdown
            </div>

            <h1 className="max-w-lg text-4xl font-semibold leading-tight text-fg sm:text-5xl">
              Crea o apri un vault
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-fg-subtle">
              Un vault è una cartella locale che contiene le tue note Markdown. Scegli una cartella
              esistente o creane una nuova dalla finestra di sistema.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={busy}
                onClick={(): void => {
                  void handlePrimaryOpen();
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-[0_14px_32px_rgba(90,108,80,0.24)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                <FolderOpen size={18} aria-hidden="true" weight="bold" />
                {primaryOpening ? 'Apertura...' : 'Crea o apri un vault'}
              </button>
              <span className="text-sm text-fg-muted">I file restano sul tuo computer.</span>
            </div>

            {error !== null && (
              <p
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm leading-5 text-red-700 dark:text-red-300"
              >
                <WarningCircle
                  size={17}
                  aria-hidden="true"
                  weight="fill"
                  className="mt-0.5 shrink-0"
                />
                <span>{error}</span>
              </p>
            )}

            <div className="mt-10 grid max-w-lg gap-3 text-sm text-fg-subtle sm:grid-cols-2">
              <div className="rounded-md border border-[#e3dbcf] bg-white/45 px-3 py-3 dark:border-border dark:bg-bg-subtle">
                <div className="font-medium text-fg">Indicizzazione locale</div>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  ziba prepara ricerca, backlink e relazioni senza spostare i tuoi file.
                </p>
              </div>
              <div className="rounded-md border border-[#e3dbcf] bg-white/45 px-3 py-3 dark:border-border dark:bg-bg-subtle">
                <div className="font-medium text-fg">Compatibile con altri editor</div>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  Continua a modificare le note dalla cartella, quando vuoi.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-0 items-center justify-center overflow-hidden border-l border-[#e3dbcf] bg-[#eee6da] px-10 py-8 dark:border-border dark:bg-bg-subtle lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(255,255,255,0.72),transparent_31%),radial-gradient(circle_at_82%_72%,rgba(90,108,80,0.15),transparent_34%)]" />
          <div className="relative w-full max-w-3xl rounded-[1.25rem] border border-white/70 bg-[#fbfaf7] p-3 shadow-[0_32px_80px_rgba(62,52,38,0.18)] dark:border-border dark:bg-bg">
            <div className="flex h-[min(72vh,620px)] min-h-[460px] overflow-hidden rounded-xl border border-[#e6ded1] bg-bg dark:border-border">
              <aside className="flex w-56 shrink-0 flex-col border-r border-[#e4dbcf] bg-[#f5efe6] dark:border-border dark:bg-bg-subtle">
                <div className="border-b border-[#e4dbcf] px-4 py-3 dark:border-border">
                  <div className="mb-2 h-2 w-16 rounded-full bg-[#d5cbbd]" />
                  <div className="h-7 rounded-md bg-white shadow-sm dark:bg-bg-muted" />
                </div>
                <div className="space-y-1 px-3 py-3">
                  {['Diario', 'Progetti', 'Letture'].map((label, idx) => (
                    <div
                      key={label}
                      className={
                        'flex h-8 items-center gap-2 rounded-md px-2 text-xs ' +
                        (idx === 1 ? 'bg-white text-fg shadow-sm dark:bg-bg' : 'text-fg-muted')
                      }
                    >
                      <FileText
                        size={14}
                        aria-hidden="true"
                        weight={idx === 1 ? 'fill' : 'regular'}
                      />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto border-t border-[#e4dbcf] px-4 py-3 text-[11px] text-fg-muted dark:border-border">
                  128 note indicizzate
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#e6ded1] bg-white/70 px-5 dark:border-border dark:bg-bg-subtle">
                  <div className="flex items-center gap-2 rounded-md border border-[#e6ded1] bg-[#fbfaf7] px-2 py-1 text-xs text-fg-muted dark:border-border dark:bg-bg">
                    <MagnifyingGlass size={13} aria-hidden="true" />
                    Cerca nel vault
                  </div>
                  <Graph size={18} aria-hidden="true" className="text-fg-muted" />
                </header>
                <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px]">
                  <article className="px-8 py-8">
                    <div className="mb-4 h-3 w-24 rounded-full bg-bg-muted" />
                    <div className="mb-7 h-8 w-64 rounded-md bg-[#ded3c4]" />
                    <div className="space-y-3">
                      <div className="h-3 w-full rounded-full bg-bg-muted" />
                      <div className="h-3 w-[92%] rounded-full bg-bg-muted" />
                      <div className="h-3 w-[74%] rounded-full bg-bg-muted" />
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-3">
                      <div className="h-24 rounded-md border border-[#e6ded1] bg-bg-subtle dark:border-border" />
                      <div className="h-24 rounded-md border border-[#e6ded1] bg-bg-subtle dark:border-border" />
                    </div>
                  </article>
                  <aside className="border-l border-[#e6ded1] bg-[#f7f3ec] px-4 py-5 dark:border-border dark:bg-bg-subtle">
                    <div className="mb-3 text-[11px] font-semibold text-fg-muted">Backlink</div>
                    <div className="space-y-2">
                      <div className="h-9 rounded-md bg-white dark:bg-bg" />
                      <div className="h-9 rounded-md bg-white dark:bg-bg" />
                      <div className="h-9 rounded-md bg-white/70 dark:bg-bg" />
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </div>
        </div>

        {recentVaults.length > 0 && (
          <section
            aria-labelledby="recent-vaults-heading"
            className="col-span-full flex max-h-[min(46vh,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden border-t border-[#e3dbcf] bg-[#fbfaf7]/80 px-7 py-5 backdrop-blur dark:border-border dark:bg-bg-subtle sm:px-10 lg:absolute lg:bottom-0 lg:left-0 lg:w-[min(45rem,48vw)] lg:border-r lg:py-6"
          >
            <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
              <h2 id="recent-vaults-heading" className="text-sm font-semibold text-fg">
                Vault recenti
              </h2>
              <ClockCounterClockwise size={17} aria-hidden="true" className="text-fg-muted" />
            </div>
            <ul
              aria-label="Vault recenti"
              className="grid min-h-0 gap-2 overflow-y-auto overflow-x-hidden pr-1"
            >
              {recentVaults.map((v) => {
                const isOpening = openingRecentRoot === v.root;

                return (
                  <li key={v.root} className="min-w-0">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={
                        isOpening
                          ? `Apertura ${v.name}`
                          : `${v.name} ${v.root} ${formatRelativeDate(v.openedAt)}`
                      }
                      onClick={(): void => {
                        void handleOpenRecent(v);
                      }}
                      className="group flex min-h-14 min-w-0 w-full items-center gap-3 rounded-md border border-[#e4dbcf] bg-white/70 px-3 py-2 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-[#d2c6b8] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none dark:border-border dark:bg-bg dark:hover:bg-bg-muted"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#eee6da] text-fg-subtle dark:bg-bg-muted">
                        <FolderOpen size={17} aria-hidden="true" weight="duotone" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-fg">
                          {isOpening ? `Apertura ${v.name}` : v.name}
                        </span>
                        <span className="block truncate text-xs text-fg-muted">{v.root}</span>
                      </span>
                      <span className="hidden shrink-0 text-xs tabular-nums text-fg-muted sm:inline">
                        {formatRelativeDate(v.openedAt)}
                      </span>
                      <ArrowRight
                        size={15}
                        aria-hidden="true"
                        className="shrink-0 text-fg-muted transition group-hover:translate-x-0.5 group-hover:text-fg"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}
