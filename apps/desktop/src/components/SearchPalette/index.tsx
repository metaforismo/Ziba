import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useSearchStore } from '../../stores/search';
import { useVaultStore } from '../../stores/vault';
import { EmptyView } from '../ui/EmptyView';
import { HighlightedTitle } from './HighlightedTitle';
import { SnippetText } from './SnippetText';

/** Longest query we echo verbatim in the no-results line before eliding. */
const MAX_ECHOED_QUERY = 80;

function elideQuery(q: string): string {
  return q.length > MAX_ECHOED_QUERY ? `${q.slice(0, MAX_ECHOED_QUERY)}…` : q;
}

/**
 * Cmd/Ctrl+K command palette: full-text search across the open vault.
 *
 * Mounted unconditionally at the top of the App tree but only renders
 * (via createPortal) when `useSearchStore.open` is true and a vault is
 * open. Closing the palette is the responsibility of the store so any
 * keyboard shortcut from anywhere in the app can drive it.
 */
export function SearchPalette(): JSX.Element | null {
  const open = useSearchStore((s) => s.open);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const loading = useSearchStore((s) => s.loading);
  const error = useSearchStore((s) => s.error);
  const setQuery = useSearchStore((s) => s.setQuery);
  const closePalette = useSearchStore((s) => s.closePalette);
  const selectNext = useSearchStore((s) => s.selectNext);
  const selectPrev = useSearchStore((s) => s.selectPrev);
  const chooseSelected = useSearchStore((s) => s.chooseSelected);

  const currentVault = useVaultStore((s) => s.current);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Closing the palette when the active vault changes prevents a stale
  // hit list (against the previous vault) from being clickable. Cheap
  // subscription: only re-runs when the vault root identity changes.
  useEffect(() => {
    if (!open) return;
    if (currentVault === null) {
      closePalette();
    }
  }, [currentVault, open, closePalette]);

  // Focus the input on every open. Selecting all makes it cheap to
  // refine the previous query without a manual Cmd+A first.
  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (input !== null) {
      input.focus();
      input.select();
    }
  }, [open]);

  // Keep the highlighted row in view when navigating with the arrow
  // keys. `block: 'nearest'` avoids the jumpy "scroll to centre" effect
  // when the row is already visible.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list === null) return;
    const node = list.querySelector<HTMLElement>(`[data-result-index="${selectedIndex}"]`);
    if (node !== null) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, open]);

  if (!open) return null;
  if (currentVault === null) return null;
  if (typeof document === 'undefined') return null;

  const trimmedQuery = query.trim();
  const showEmptyHint = trimmedQuery === '';
  // Guard against a debounce race: `loading` stays true while a newer
  // query is in flight, so we never flash "no results" against a stale
  // empty list. Whitespace-only queries collapse to `trimmedQuery === ''`,
  // so they land in the hint branch, not the no-results branch.
  const showNoResults = !showEmptyHint && !loading && error === null && results.length === 0;
  const showResultCount = !showEmptyHint && error === null && results.length > 0;
  const resultCountLabel = results.length === 1 ? '1 risultato' : `${results.length} risultati`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNext();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectPrev();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void chooseSelected();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e): void => {
        // Use mousedown rather than click so the palette closes before
        // the would-be click target receives focus — avoids stealing
        // focus from the editor when the user dismisses by clicking
        // outside the card.
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cerca nelle note"
        onKeyDown={handleKeyDown}
        className="flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-md border border-border bg-bg-subtle shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e): void => setQuery(e.target.value)}
            placeholder="Cerca nelle note..."
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
          />
          {loading && (
            <span className="shrink-0 text-xs text-fg-muted" aria-live="polite">
              Cerco...
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error !== null && (
            <p className="px-3 py-3 text-xs text-red-500" role="alert">
              {error}
            </p>
          )}

          {showEmptyHint && error === null && (
            <p className="px-3 py-3 text-xs text-fg-muted">
              Inizia a digitare per cercare. Sintassi FTS5: <code>foo OR bar</code>,{' '}
              <code>&quot;frase esatta&quot;</code>, <code>-escludi</code>.
            </p>
          )}

          {showNoResults && (
            <div className="px-3 py-7">
              <EmptyView
                icon={<MagnifyingGlass size={26} weight="duotone" />}
                title="Nessun risultato"
                description={`Nessuna nota corrisponde a «${elideQuery(trimmedQuery)}». Prova termini diversi o la sintassi FTS5 (foo OR bar, "frase esatta", -escludi).`}
              />
            </div>
          )}

          {results.length > 0 && (
            <ul ref={listRef} className="py-1">
              {results.map((hit, i) => {
                const selected = i === selectedIndex;
                return (
                  <li key={hit.path} data-result-index={i}>
                    <button
                      type="button"
                      onClick={(): void => {
                        // Pre-select the clicked row so `chooseSelected`
                        // opens the right note even if the click landed
                        // on a non-highlighted row.
                        useSearchStore.setState({ selectedIndex: i });
                        void chooseSelected();
                      }}
                      onMouseEnter={(): void => {
                        useSearchStore.setState({ selectedIndex: i });
                      }}
                      className={clsx(
                        'block w-full px-3 py-2 text-left text-sm',
                        selected ? 'bg-bg-muted text-fg' : 'text-fg-subtle hover:bg-bg-muted',
                      )}
                    >
                      <HighlightedTitle
                        title={hit.title}
                        query={trimmedQuery}
                        className="block truncate font-semibold text-fg"
                      />
                      <SnippetText
                        snippet={hit.snippet}
                        className="mt-0.5 block truncate text-xs text-fg-muted"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(showResultCount || currentVault !== null) && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-fg-muted">
            <span aria-live="polite" className="tabular-nums">
              {showResultCount ? resultCountLabel : ''}
            </span>
            <span className="min-w-0 truncate" title={`Ambito: ${currentVault.name}`}>
              in {currentVault.name}
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
