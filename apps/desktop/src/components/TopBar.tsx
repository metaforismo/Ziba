import { useUiStore, type MainView } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

type TopBarProps = {
  onChangeVault: () => void;
};

type ViewSpec = {
  id: MainView;
  label: string;
  title: string;
  icon: JSX.Element;
};

const VIEWS: readonly ViewSpec[] = [
  {
    id: 'editor',
    label: 'Editor',
    title: 'Editor (note)',
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    id: 'database',
    label: 'Database',
    title: 'Vista database (tabella)',
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
      </svg>
    ),
  },
  {
    id: 'graph',
    label: 'Grafo',
    title: 'Grafo globale del vault',
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="12" cy="19" r="2" />
        <path d="M7 5h10" />
        <path d="M6 7l5 10" />
        <path d="M18 7l-5 10" />
      </svg>
    ),
  },
];

export function TopBar({ onChangeVault }: TopBarProps): JSX.Element {
  const current = useVaultStore((s) => s.current);
  const indexProgress = useVaultStore((s) => s.indexProgress);
  const backlinksOpen = useUiStore((s) => s.backlinksOpen);
  const toggleBacklinks = useUiStore((s) => s.toggleBacklinks);
  const mainView = useUiStore((s) => s.mainView);
  const setMainView = useUiStore((s) => s.setMainView);

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
      <div role="tablist" aria-label="Vista principale" className="flex items-center gap-0.5">
        {VIEWS.map((v) => {
          const active = v.id === mainView;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={v.title}
              onClick={(): void => {
                setMainView(v.id);
              }}
              className={`flex items-center gap-1.5 rounded px-2 py-1 ${
                active ? 'bg-bg-muted text-fg' : 'text-fg-subtle hover:bg-bg-muted hover:text-fg'
              }`}
            >
              {v.icon}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          );
        })}
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
