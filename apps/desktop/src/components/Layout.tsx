import { BacklinksPanel } from './BacklinksPanel';
import { DatabaseView } from './DatabaseView';
import { Editor } from './Editor';
import { GlobalGraph } from './GlobalGraph';
import { Resizer } from './Resizer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUiStore } from '../stores/ui';
import { useVaultStore } from '../stores/vault';

export function Layout(): JSX.Element {
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const backlinksWidth = useUiStore((s) => s.backlinksWidth);
  const backlinksOpen = useUiStore((s) => s.backlinksOpen);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const setBacklinksWidth = useUiStore((s) => s.setBacklinksWidth);
  const mainView = useUiStore((s) => s.mainView);

  const pickAndOpenVault = useVaultStore((s) => s.pickAndOpenVault);

  return (
    <div className="flex h-full w-full flex-col">
      <TopBar
        onChangeVault={(): void => {
          void pickAndOpenVault();
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div style={{ width: `${sidebarWidth}px` }} className="shrink-0 border-r border-border">
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
            <div className="flex min-w-0 flex-1">
              <Editor />
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
                  className="shrink-0 border-l border-border"
                >
                  <BacklinksPanel />
                </div>
              </>
            )}
          </>
        )}

        {mainView === 'database' && (
          <div className="flex min-w-0 flex-1">
            <DatabaseView />
          </div>
        )}

        {mainView === 'graph' && (
          <div className="flex min-w-0 flex-1">
            <GlobalGraph />
          </div>
        )}
      </div>
    </div>
  );
}
