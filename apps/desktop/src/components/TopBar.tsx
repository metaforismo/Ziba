import { CaretDown, FolderOpen, LinkSimple, Plus, X } from '@phosphor-icons/react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ConfirmDialog } from './Sidebar/ConfirmDialog';
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

/** Immediate parent folder of a note path (empty string when at the root). */
function parentFolderOf(path: string): string {
  const segments = path.split('/');
  segments.pop();
  return segments.pop() ?? '';
}

/**
 * Disambiguate tabs that share a basename title by suffixing the parent
 * folder, so two `Index` notes from different folders read as
 * `Index — Projects` / `Index — Inbox`. Tabs with a unique title are
 * returned unchanged. Returns a `tabId → display label` map.
 */
function disambiguateTitles(tabs: EditorTab[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const tab of tabs) counts.set(tab.title, (counts.get(tab.title) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const tab of tabs) {
    const duplicated = (counts.get(tab.title) ?? 0) > 1;
    const folder = duplicated ? parentFolderOf(tab.path) : '';
    labels.set(tab.id, folder === '' ? tab.title : `${tab.title} — ${folder}`);
  }
  return labels;
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
  // Tab whose close was requested while it had unsaved changes — we hold
  // it pending a confirmation rather than dropping the edits silently.
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  const tabLabels = useMemo(() => disambiguateTitles(tabs), [tabs]);
  const pendingCloseTab =
    pendingCloseTabId === null ? null : (workspace.tabsById[pendingCloseTabId] ?? null);

  // Per-tab element refs so arrow-key navigation can move DOM focus between
  // tabs (WAI-ARIA tabs APG). Inactive tabs carry tabIndex=-1 but stay
  // programmatically focusable.
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Closing a clean tab is immediate; a dirty one routes through a confirm
  // dialog so unsaved edits (autosave is debounced, so a tab can be dirty
  // at close time) are never lost without acknowledgement.
  const requestCloseTab = (tab: EditorTab): void => {
    if (tab.dirty) {
      setPendingCloseTabId(tab.id);
      return;
    }
    closeTab(tab.id);
  };

  // Roving-focus keyboard navigation across the tab strip (WAI-ARIA tabs
  // APG, manual activation): Arrow Left/Right move focus between tabs and
  // Home/End jump to the ends. We move focus only — selection still requires
  // Enter/Space — so arrowing never silently swaps the open note. The close
  // button stops propagation, so these handlers only fire from the tab itself.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number): void => {
    let targetIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        targetIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        targetIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = tabs.length - 1;
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const tab = tabs[index];
        if (tab !== undefined) {
          selectTab(tab.id);
          setMainView('editor');
        }
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    const targetTab = tabs[targetIndex];
    if (targetTab === undefined) return;
    tabRefs.current.get(targetTab.id)?.focus();
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
          className="app-no-drag inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-fg transition hover:bg-bg-muted/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:translate-y-px"
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

      {/* Tab strip. `overflow-x-auto` keeps many tabs scrollable instead of
          squashing them below a usable width; each tab keeps a min width. */}
      <div
        role="tablist"
        aria-label="Note aperte"
        className="ziba-tabstrip flex min-w-0 flex-1 items-end gap-px overflow-x-auto overflow-y-hidden"
      >
        {tabs.length === 0 ? (
          <div className="flex h-full items-center px-3 text-xs text-fg-muted">
            Nessuna nota aperta
          </div>
        ) : (
          tabs.map((tab, index) => {
            const active = pane?.activeTabId === tab.id;
            const label = tabLabels.get(tab.id) ?? tab.title;
            return (
              <div
                key={tab.id}
                ref={(el): void => {
                  if (el === null) tabRefs.current.delete(tab.id);
                  else tabRefs.current.set(tab.id, el);
                }}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                aria-label={label}
                onClick={(): void => {
                  selectTab(tab.id);
                  setMainView('editor');
                }}
                onKeyDown={(event): void => handleTabKeyDown(event, index)}
                title={tab.path}
                className={
                  'app-no-drag group relative flex h-10 max-w-[14rem] min-w-[8rem] cursor-pointer items-center gap-2 rounded-t-lg border-x border-t px-3 text-left text-[13px] outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ' +
                  (active
                    ? 'z-10 border-border bg-bg text-fg shadow-[0_-1px_0_rgb(var(--bg))_inset]'
                    : 'border-transparent text-fg-muted hover:bg-bg-muted/70 hover:text-fg')
                }
              >
                {/* Dirty indicator. The dot is replaced by the close button
                    on hover/focus so both can share one slot without jitter. */}
                {tab.dirty && (
                  <span
                    aria-label="Modifiche non salvate"
                    title="Modifiche non salvate"
                    className="size-1.5 shrink-0 rounded-full bg-accent transition group-hover:opacity-0 group-focus-within:opacity-0"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <button
                  type="button"
                  aria-label={`Chiudi ${label}`}
                  title="Chiudi"
                  onClick={(event): void => {
                    event.stopPropagation();
                    requestCloseTab(tab);
                  }}
                  onKeyDown={(event): void => {
                    // Stop Enter/Space from also triggering the tab's own
                    // select handler (the close is the intended action here).
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                    }
                  }}
                  className={
                    'inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted opacity-0 transition hover:bg-bg-muted hover:text-fg focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent group-hover:opacity-100 group-focus-within:opacity-100 ' +
                    // A dirty tab overlays the close button on top of the dot
                    // slot, so pull it left to reclaim that space.
                    (tab.dirty ? '-ml-3.5' : '')
                  }
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
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
          className="app-no-drag mb-1 ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
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
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-bg-muted/80 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:translate-y-px ${
              backlinksOpen ? 'bg-bg-muted text-fg' : 'text-fg-subtle'
            }`}
          >
            <LinkSimple size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {pendingCloseTab !== null && (
        <ConfirmDialog
          title="Chiudere senza salvare?"
          message={`"${tabLabels.get(pendingCloseTab.id) ?? pendingCloseTab.title}" ha modifiche non salvate. Chiudendo la tab le perderai.`}
          confirmLabel="Chiudi senza salvare"
          cancelLabel="Annulla"
          destructive
          onConfirm={(): void => {
            closeTab(pendingCloseTab.id);
            setPendingCloseTabId(null);
          }}
          onCancel={(): void => setPendingCloseTabId(null)}
        />
      )}
    </header>
  );
}
