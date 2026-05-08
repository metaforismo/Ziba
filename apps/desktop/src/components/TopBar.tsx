import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

type TopBarProps = {
  onChangeVault: () => void;
};

export function TopBar({ onChangeVault }: TopBarProps): JSX.Element {
  const current = useVaultStore((s) => s.current);
  const indexProgress = useVaultStore((s) => s.indexProgress);
  const backlinksOpen = useUiStore((s) => s.backlinksOpen);
  const toggleBacklinks = useUiStore((s) => s.toggleBacklinks);

  return (
    <header className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-bg-subtle px-3 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-medium text-fg">
          {current === null ? 'synapsium' : current.name}
        </span>
        {indexProgress !== null && (
          <span className="text-xs text-fg-muted">
            Indicizzo… {indexProgress.processed}
            {indexProgress.total !== null && `/${indexProgress.total}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onChangeVault}
          className="rounded px-2 py-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"
        >
          Cambia vault
        </button>
        <button
          type="button"
          onClick={toggleBacklinks}
          aria-label={backlinksOpen ? 'Nascondi backlink' : 'Mostra backlink'}
          aria-pressed={backlinksOpen}
          className={`rounded p-1 hover:bg-bg-muted hover:text-fg ${
            backlinksOpen ? 'text-fg' : 'text-fg-subtle'
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 17H7A5 5 0 0 1 7 7h2" />
            <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
}
