import { useCallback, useState } from 'react';
import { useEditorStore } from '../../stores/editor';
import { useUiStore, type RightPaneTab } from '../../stores/ui';
import { MiniGraph } from '../MiniGraph';
import { BacklinksList } from './BacklinksList';

type TabSpec = {
  id: RightPaneTab;
  label: string;
};

// Italian copy: "Grafo" reads more naturally than "Graph" alongside the
// existing "Backlinks" label in the rest of the UI.
const TABS: readonly TabSpec[] = [
  { id: 'backlinks', label: 'Backlinks' },
  { id: 'graph', label: 'Grafo' },
] as const;

/**
 * Tabbed shell for the right-side panel. Hosts:
 *  - `<BacklinksList />`: the inbound-link list (extracted from the
 *    original v0.1 panel body).
 *  - `<MiniGraph />`: the v0.2 Wave 3 local-neighborhood graph.
 *
 * The outer `<aside>` wrapper is intentionally preserved so `Layout.tsx`
 * doesn't need to change. The active tab is persisted via `useUiStore`.
 *
 * Loading is surfaced as a single indicator on the active tab — each
 * child component reports its own loading state via `onLoadingChange`,
 * but only the active child's signal is rendered, since the inactive
 * tab is unmounted (its fetch effect is paused) until the user switches.
 */
export function BacklinksPanel(): JSX.Element {
  const currentPath = useEditorStore((s) => s.currentPath);
  const activeTab = useUiStore((s) => s.rightPaneTab);
  const setRightPaneTab = useUiStore((s) => s.setRightPaneTab);

  const [activeLoading, setActiveLoading] = useState(false);

  // Stable callback so children's `useEffect(onLoadingChange)` doesn't
  // re-fire on every parent render.
  const handleLoadingChange = useCallback((loading: boolean) => {
    setActiveLoading(loading);
  }, []);

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-bg-subtle">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div role="tablist" aria-label="Pannello laterale" className="flex items-center gap-2">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`right-pane-panel-${tab.id}`}
                id={`right-pane-tab-${tab.id}`}
                onClick={(): void => {
                  setRightPaneTab(tab.id);
                }}
                className={
                  active
                    ? 'rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-fg'
                    : 'rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-fg-muted hover:text-fg-subtle'
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {activeLoading && (
          <span className="text-[10px] uppercase tracking-wide text-fg-muted">…</span>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto"
        role="tabpanel"
        id={`right-pane-panel-${activeTab}`}
        aria-labelledby={`right-pane-tab-${activeTab}`}
      >
        {activeTab === 'backlinks' ? (
          <BacklinksList currentPath={currentPath} onLoadingChange={handleLoadingChange} />
        ) : (
          <MiniGraph currentPath={currentPath} onLoadingChange={handleLoadingChange} />
        )}
      </div>
    </aside>
  );
}
