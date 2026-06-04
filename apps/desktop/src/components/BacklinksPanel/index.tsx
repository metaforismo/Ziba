import { useCallback, useState } from 'react';
import { extractType } from '@ziba/core';
import { useEditorStore } from '../../stores/editor';
import { useUiStore, type RightPaneTab } from '../../stores/ui';
import { MiniGraph } from '../MiniGraph';
import { ObjectPanel } from '../ObjectPanel';
import { OutlinePanel } from '../OutlinePanel';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ReferencesPanel } from './ReferencesPanel';

type TabSpec = {
  id: RightPaneTab;
  label: string;
};

const TABS_UNTYPED: readonly TabSpec[] = [
  { id: 'outline', label: 'Indice' },
  { id: 'references', label: 'Riferimenti' },
  { id: 'graph', label: 'Grafo' },
] as const;

const TABS_TYPED: readonly TabSpec[] = [
  { id: 'object', label: 'Oggetto' },
  { id: 'outline', label: 'Indice' },
  { id: 'references', label: 'Riferimenti' },
  { id: 'graph', label: 'Grafo' },
] as const;

/**
 * Tabbed shell for the right-side panel. Hosts:
 *  - `<ObjectPanel />`: typed-note properties and object relations.
 *  - `<OutlinePanel />`: current-note heading index.
 *  - `<ReferencesPanel />`: inbound links plus plain-text mentions.
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
  const currentNote = useEditorStore((s) => s.currentNote);
  const persistedTab = useUiStore((s) => s.rightPaneTab);
  const setRightPaneTab = useUiStore((s) => s.setRightPaneTab);

  const [activeLoading, setActiveLoading] = useState(false);

  // Stable callback so children's `useEffect(onLoadingChange)` doesn't
  // re-fire on every parent render.
  const handleLoadingChange = useCallback((loading: boolean) => {
    setActiveLoading(loading);
  }, []);

  const isTyped = currentNote !== null && extractType(currentNote.frontmatter) !== null;
  const tabs = isTyped ? TABS_TYPED : TABS_UNTYPED;
  const activeTab: RightPaneTab = persistedTab === 'object' && !isTyped ? 'outline' : persistedTab;

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-bg-subtle">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <SegmentedControl
          ariaLabel="Pannello laterale"
          value={activeTab}
          items={tabs}
          onChange={setRightPaneTab}
        />
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
        {activeTab === 'object' ? (
          <ObjectPanel />
        ) : activeTab === 'outline' ? (
          <OutlinePanel currentPath={currentPath} markdown={currentNote?.content ?? ''} />
        ) : activeTab === 'references' ? (
          <ReferencesPanel currentPath={currentPath} onLoadingChange={handleLoadingChange} />
        ) : (
          <MiniGraph currentPath={currentPath} onLoadingChange={handleLoadingChange} />
        )}
      </div>
    </aside>
  );
}
