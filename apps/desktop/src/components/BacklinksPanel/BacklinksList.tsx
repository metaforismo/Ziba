import { useEffect, useRef, useState } from 'react';
import type { NotePath } from '@synapsium/core';
import type { Backlink } from '../../../shared/ipc';
import { ipc } from '../../lib/ipc';
import { debounce } from '../../lib/debounce';
import { BACKLINKS_REFETCH_MS } from '../../lib/timings';
import { useEditorStore } from '../../stores/editor';

type Props = {
  currentPath: NotePath | null;
  /**
   * Bubbles up loading state so the parent (the tabbed shell) can show
   * an indicator on the active tab. Called on every state change.
   */
  onLoadingChange?: (loading: boolean) => void;
};

/**
 * Renders the inbound-backlinks list for the currently-open note.
 *
 * Extracted from the original `BacklinksPanel` body in v0.2 Wave 3 so the
 * panel can be a tabbed shell hosting both this list and the mini-graph.
 * The fetching/cancellation behavior is unchanged from the original
 * implementation — only the surrounding `<aside>` and header have moved
 * to the parent.
 */
export function BacklinksList({ currentPath, onLoadingChange }: Props): JSX.Element {
  const openNote = useEditorStore((s) => s.openNote);

  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  // Forward loading state to parent so it can render a single indicator
  // on the active tab. Done in a separate effect to keep the fetch logic
  // unchanged and avoid spurious renders when the callback identity flips.
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

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
    }, BACKLINKS_REFETCH_MS);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return () => {
      offEvent();
      debouncedRefetch.cancel();
    };
  }, [currentPath]);

  if (currentPath === null) {
    return <p className="px-3 py-2 text-xs text-fg-muted">Apri una nota per vedere i backlink.</p>;
  }
  if (backlinks.length === 0) {
    return <p className="px-3 py-2 text-xs text-fg-muted">Nessuna nota linka questa.</p>;
  }
  return (
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
  );
}
