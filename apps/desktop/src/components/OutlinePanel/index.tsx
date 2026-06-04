import { MagnifyingGlass } from '@phosphor-icons/react';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { dispatchScrollToHeading, extractOutlineHeadings } from '../../lib/outline';

export type OutlinePanelProps = {
  currentPath: string | null;
  markdown: string;
};

export function OutlinePanel({ currentPath, markdown }: OutlinePanelProps): JSX.Element {
  const [query, setQuery] = useState('');
  const headings = useMemo(() => extractOutlineHeadings(markdown), [markdown]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleHeadings = useMemo(() => {
    if (normalizedQuery.length === 0) return headings;
    return headings.filter((heading) => heading.text.toLowerCase().includes(normalizedQuery));
  }, [headings, normalizedQuery]);

  return (
    <section className="flex min-h-full flex-col bg-bg-subtle">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Indice</h2>
          <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-fg-muted">
            {headings.length}
          </span>
        </div>
        <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2 text-fg-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
          <MagnifyingGlass size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="Filtra indice"
            placeholder="Filtra indice"
            value={query}
            onChange={(event): void => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-muted"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {currentPath === null ? (
          <p className="px-2 py-3 text-sm text-fg-muted">Nessuna nota aperta.</p>
        ) : headings.length === 0 ? (
          <p className="px-2 py-3 text-sm text-fg-muted">Nessun titolo nella nota.</p>
        ) : visibleHeadings.length === 0 ? (
          <p className="px-2 py-3 text-sm text-fg-muted">Nessun risultato.</p>
        ) : (
          <ol role="list" className="space-y-px">
            {visibleHeadings.map((heading) => (
              <li key={`${heading.index}-${heading.line}`}>
                <button
                  type="button"
                  onClick={(): void => {
                    dispatchScrollToHeading({ path: currentPath, index: heading.index });
                  }}
                  title={`Riga ${heading.line}`}
                  style={{ paddingLeft: `${0.5 + (heading.level - 1) * 0.75}rem` }}
                  className="flex min-h-7 w-full min-w-0 items-center rounded px-2 py-1 text-left text-xs text-fg-subtle transition hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
                >
                  <span className="truncate">{heading.text}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
