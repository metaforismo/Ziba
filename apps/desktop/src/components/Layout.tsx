import { BacklinksPanel } from './BacklinksPanel';
import { Breadcrumb, notePathToSegments } from './Breadcrumb';
import { DatabaseView } from './DatabaseView';
import { Editor } from './Editor';
import { GlobalGraph } from './GlobalGraph';
import { Resizer } from './Resizer';
import { Ribbon } from './Ribbon';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useEditorStore } from '../stores/editor';
import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

export function Layout(): JSX.Element {
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const backlinksWidth = useUiStore((s) => s.backlinksWidth);
  const backlinksOpen = useUiStore((s) => s.backlinksOpen);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const setBacklinksWidth = useUiStore((s) => s.setBacklinksWidth);
  const mainView = useUiStore((s) => s.mainView);

  const currentVault = useVaultStore((s) => s.current);
  const currentPath = useEditorStore((s) => s.currentPath);
  const pickAndOpenVault = useVaultStore((s) => s.pickAndOpenVault);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <TopBar
        sidebarWidth={sidebarWidth}
        onChangeVault={(): void => {
          void pickAndOpenVault();
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Ribbon />
        <div style={{ width: `${sidebarWidth}px` }} className="min-h-0 shrink-0 overflow-hidden">
          <Sidebar />
        </div>
        <Resizer
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          side="left"
          ariaLabel="Ridimensiona barra laterale"
        />

        {mainView === 'editor' && (
          <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Breadcrumb
                vaultName={currentVault?.name ?? 'ziba'}
                segments={currentPath === null ? [] : notePathToSegments(currentPath)}
              />
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <Editor />
              </div>
            </div>

            {backlinksOpen && (
              <>
                <Resizer
                  width={backlinksWidth}
                  onWidthChange={setBacklinksWidth}
                  side="right"
                  ariaLabel="Ridimensiona pannello backlink"
                />
                <div
                  style={{ width: `${backlinksWidth}px` }}
                  className="min-h-0 shrink-0 overflow-hidden border-l border-border"
                >
                  <BacklinksPanel />
                </div>
              </>
            )}
          </>
        )}

        {mainView === 'database' && (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <DatabaseView />
          </div>
        )}

        {mainView === 'graph' && (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <GlobalGraph />
          </div>
        )}
      </div>
    </div>
  );
}
