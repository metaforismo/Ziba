import { useEffect, useRef, useState } from 'react';
import type { Backlink } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { debounce } from '../../lib/debounce';
import { useEditorStore } from '../../stores/editor';

export function BacklinksPanel(): JSX.Element {
  const currentPath = useEditorStore((s) => s.currentPath);
  const openNote = useEditorStore((s) => s.openNote);

  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (currentPath === null) {
      setBacklinks([]);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);

    const fetchBacklinks = async (): Promise<void> => {
      try {
        const result = await ipc.getBacklinks({ path: currentPath });
        if (seq !== requestSeq.current) return;
        setBacklinks(result);
      } catch {
        if (seq !== requestSeq.current) return;
        setBacklinks([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    };

    void fetchBacklinks();

    // Vault changes can affect inbound backlinks (other notes adding/removing
    // wikilinks to the open note). Re-fetch with a small debounce on every
    // vault event so the panel stays in sync without thrashing during bursts.
    const debouncedRefetch = debounce(() => {
      void fetchBacklinks();
    }, 250);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return () => {
      offEvent();
      debouncedRefetch.cancel();
    };
  }, [currentPath]);

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-bg-subtle">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Backlinks
        </span>
        {loading && <span className="text-[10px] uppercase tracking-wide text-fg-muted">…</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {currentPath === null ? (
          <p className="px-3 py-2 text-xs text-fg-muted">Apri una nota per vedere i backlink.</p>
        ) : backlinks.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-muted">Nessuna nota linka questa.</p>
        ) : (
          <ul className="px-1 pb-2">
            {backlinks.map((b) => (
              <li key={b.sourcePath}>
                <button
                  type="button"
                  onClick={(): void => {
                    void openNote(b.sourcePath);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-fg-subtle hover:bg-bg-muted hover:text-fg"
                >
                  <span className="block truncate font-medium">{b.sourceTitle}</span>
                  {b.context !== undefined && (
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">{b.context}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
