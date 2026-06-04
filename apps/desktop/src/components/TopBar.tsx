import { CaretDown, FolderOpen, LinkSimple, Plus, X } from '@phosphor-icons/react';
import { ipcErrorMessage } from '../lib/ipc-error';
import { useEditorStore, type EditorPane, type EditorTab } from '../stores/editor';
import { toast } from '../stores/toast';
import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

type TopBarProps = {
  onChangeVault: () => void;
  sidebarWidth: number;
};

const TITLEBAR_CHROME_INSET = 86;
const RIBBON_WIDTH = 48;
const MIN_VAULT_CELL_WIDTH = 120;

function activePaneAndTabs(
  panes: EditorPane[],
  activePaneId: string,
  tabsById: Record<string, EditorTab>,
): { pane: EditorPane | null; tabs: EditorTab[] } {
  const pane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;
  if (pane === null) return { pane: null, tabs: [] };
  return {
    pane,
    tabs: pane.tabIds
      .map((id) => tabsById[id])
      .filter((tab): tab is EditorTab => tab !== undefined),
  };
}

export function TopBar({ onChangeVault, sidebarWidth }: TopBarProps): JSX.Element {
  const current = useVaultStore((s) => s.current);
  const indexProgress = useVaultStore((s) => s.indexProgress);
  const workspace = useEditorStore((s) => s.workspace);
  const selectTab = useEditorStore((s) => s.selectTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const createUntitledNote = useEditorStore((s) => s.createUntitledNote);
  const backlinksOpen = useUiStore((s) => s.backlinksOpen);
  const toggleBacklinks = useUiStore((s) => s.toggleBacklinks);
  const setMainView = useUiStore((s) => s.setMainView);
  const mainView = useUiStore((s) => s.mainView);
  const vaultName = current === null ? 'ziba' : current.name;
  const { pane, tabs } = activePaneAndTabs(
    workspace.panes,
    workspace.activePaneId,
    workspace.tabsById,
  );
  const vaultCellWidth = Math.max(
    MIN_VAULT_CELL_WIDTH,
    sidebarWidth + RIBBON_WIDTH - TITLEBAR_CHROME_INSET,
  );

  const handleNewTab = async (): Promise<void> => {
    try {
      await createUntitledNote({ mode: 'new-tab' });
      setMainView('editor');
    } catch (err: unknown) {
      toast.error(ipcErrorMessage(err), 'Impossibile creare la nota');
    }
  };

  return (
    <header className="app-drag flex h-11 shrink-0 items-stretch border-b border-border/80 bg-bg-subtle/95 pl-[86px] text-sm shadow-[0_1px_0_rgba(30,29,27,0.04)] backdrop-blur-xl">
      <div
        style={{ width: `${vaultCellWidth}px` }}
        className="flex min-w-0 shrink-0 items-center border-r border-border/70 pr-2"
      >
        <button
          type="button"
          onClick={onChangeVault}
          aria-label={`Cambia vault: ${vaultName}`}
          title="Cambia vault"
          className="app-no-drag inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-fg transition hover:bg-bg-muted/80 active:translate-y-px"
        >
          <FolderOpen size={16} aria-hidden="true" className="shrink-0 text-fg-subtle" />
          <span className="truncate">{vaultName}</span>
          <CaretDown size={12} aria-hidden="true" className="shrink-0 text-fg-muted" />
        </button>
        {indexProgress !== null && (
          <span
            className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            aria-label="Indicizzazione in corso"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-end overflow-hidden">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center px-3 text-xs text-fg-muted">
            Nessuna nota aperta
          </div>
        ) : (
          tabs.map((tab) => {
            const active = pane?.activeTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.title}
                onClick={(): void => {
                  selectTab(tab.id);
                  setMainView('editor');
                }}
                title={tab.path}
                className={
                  'app-no-drag group relative flex h-10 max-w-[13rem] min-w-[8rem] items-center gap-2 rounded-t-lg border-x border-t px-3 text-left text-[13px] transition ' +
                  (active
                    ? 'z-10 border-border bg-bg text-fg shadow-[0_-1px_0_rgb(var(--bg))_inset]'
                    : 'border-transparent text-fg-muted hover:bg-bg-muted/70 hover:text-fg')
                }
              >
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                {tab.dirty && (
                  <span
                    aria-label="Modifiche non salvate"
                    className="size-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Chiudi ${tab.title}`}
                  onClick={(event): void => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  onKeyDown={(event): void => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      closeTab(tab.id);
                    }
                  }}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted opacity-0 transition hover:bg-bg-muted hover:text-fg group-hover:opacity-100"
                >
                  <X size={12} aria-hidden="true" />
                </span>
              </button>
            );
          })
        )}
        <button
          type="button"
          aria-label="Nuova tab"
          title="Nuova nota"
          onClick={(): void => {
            void handleNewTab();
          }}
          className="app-no-drag mb-1 ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="app-no-drag flex w-14 shrink-0 items-center justify-end pr-2">
        {mainView === 'editor' && (
          <button
            type="button"
            onClick={toggleBacklinks}
            aria-label={backlinksOpen ? 'Nascondi pannello destro' : 'Mostra pannello destro'}
            aria-pressed={backlinksOpen}
            title={backlinksOpen ? 'Nascondi pannello destro' : 'Mostra pannello destro'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-bg-muted/80 hover:text-fg active:translate-y-px ${
              backlinksOpen ? 'bg-bg-muted text-fg' : 'text-fg-subtle'
            }`}
          >
            <LinkSimple size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}
