import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretRight,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import type { NotePath } from '@ziba/core';
import type { LinkReference, LinkReferencesResult } from '../../../shared/ipc';
import { debounce } from '../../lib/debounce';
import { ipc } from '../../lib/ipc';
import { navigateToNote } from '../../lib/navigate';
import { BACKLINKS_REFETCH_MS } from '../../lib/timings';
import { SnippetText } from '../SearchPalette/SnippetText';
import { IconButton } from '../ui/IconButton';

type Props = {
  currentPath: NotePath | null;
  onLoadingChange?: (loading: boolean) => void;
};

type SectionKey = keyof LinkReferencesResult;
type SortMode = 'title-asc' | 'title-desc';

const EMPTY_REFERENCES: LinkReferencesResult = {
  backlinks: [],
  mentions: [],
};

const SECTION_LABELS: Record<SectionKey, string> = {
  backlinks: 'Backlinks',
  mentions: 'Mentions',
};

const SORT_LABELS: Record<SortMode, string> = {
  'title-asc': 'A-Z',
  'title-desc': 'Z-A',
};

function filterReferences(
  references: LinkReference[],
  filter: string,
  sortMode: SortMode,
): LinkReference[] {
  const q = filter.trim().toLocaleLowerCase();
  const filtered =
    q.length === 0
      ? references
      : references.filter((reference) => {
          const haystack = [
            reference.sourceTitle,
            reference.sourcePath,
            reference.context ?? '',
          ].join('\n');
          return haystack.toLocaleLowerCase().includes(q);
        });

  return [...filtered].sort((a, b) => {
    const delta = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    return sortMode === 'title-asc' ? delta : -delta;
  });
}

function SectionToggle({
  collapsed,
  count,
  label,
  onToggle,
}: {
  collapsed: boolean;
  count: number;
  label: string;
  onToggle: () => void;
}): JSX.Element {
  const Icon = collapsed ? CaretRight : CaretDown;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-muted hover:bg-bg-muted hover:text-fg"
    >
      <Icon aria-hidden className="h-3 w-3 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto tabular-nums">{count}</span>
    </button>
  );
}

function ReferenceRow({ reference }: { reference: LinkReference }): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={(): void => {
          void navigateToNote(reference.sourcePath);
        }}
        className="block w-full rounded px-2 py-1.5 text-left text-sm text-fg-subtle hover:bg-bg-muted hover:text-fg"
      >
        <span className="block truncate font-medium">{reference.sourceTitle}</span>
        {reference.context !== undefined && reference.context.length > 0 && (
          <SnippetText
            snippet={reference.context}
            className="mt-0.5 block line-clamp-2 text-xs leading-5 text-fg-muted"
          />
        )}
      </button>
    </li>
  );
}

export function ReferencesPanel({ currentPath, onLoadingChange }: Props): JSX.Element {
  const [references, setReferences] = useState<LinkReferencesResult>(EMPTY_REFERENCES);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('title-asc');
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    backlinks: false,
    mentions: false,
  });
  const requestSeq = useRef(0);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const fetchReferences = useCallback(async (): Promise<void> => {
    if (currentPath === null) {
      setReferences(EMPTY_REFERENCES);
      setLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await ipc.getReferences({ path: currentPath });
      if (seq !== requestSeq.current) return;
      setReferences(result);
    } catch {
      if (seq !== requestSeq.current) return;
      setReferences(EMPTY_REFERENCES);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    void fetchReferences();

    const debouncedRefetch = debounce(() => {
      void fetchReferences();
    }, BACKLINKS_REFETCH_MS);

    const offEvent = ipc.onVaultEvent(() => {
      debouncedRefetch();
    });

    return () => {
      offEvent();
      debouncedRefetch.cancel();
    };
  }, [fetchReferences]);

  const visibleReferences = useMemo(
    () => ({
      backlinks: filterReferences(references.backlinks, filter, sortMode),
      mentions: filterReferences(references.mentions, filter, sortMode),
    }),
    [filter, references.backlinks, references.mentions, sortMode],
  );

  const totalCount = references.backlinks.length + references.mentions.length;
  const filteredCount = visibleReferences.backlinks.length + visibleReferences.mentions.length;

  const toggleSection = (section: SectionKey): void => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  if (currentPath === null) {
    return (
      <p className="px-3 py-2 text-xs text-fg-muted">Apri una nota per vedere i riferimenti.</p>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-bg-subtle px-2 py-2">
        <div className="flex items-center gap-1">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Filtra riferimenti</span>
            <MagnifyingGlass
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted"
            />
            <input
              value={filter}
              onChange={(event): void => {
                setFilter(event.currentTarget.value);
              }}
              className="h-7 w-full rounded border border-border bg-bg px-7 text-xs text-fg outline-none placeholder:text-fg-muted focus:border-accent"
              placeholder="Filtra"
            />
          </label>
          <select
            aria-label="Ordinamento riferimenti"
            value={sortMode}
            onChange={(event): void => {
              setSortMode(event.currentTarget.value as SortMode);
            }}
            className="h-7 rounded border border-border bg-bg px-1 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="title-asc">{SORT_LABELS['title-asc']}</option>
            <option value="title-desc">{SORT_LABELS['title-desc']}</option>
          </select>
          <IconButton
            onClick={(): void => {
              void fetchReferences();
            }}
            label="Aggiorna riferimenti"
            icon={<ArrowCounterClockwise aria-hidden className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="mt-1 flex items-center justify-between px-0.5 text-[10px] uppercase tracking-wide text-fg-muted">
          <span>Riferimenti</span>
          <span className="tabular-nums">
            {filteredCount}/{totalCount}
          </span>
        </div>
      </div>

      {totalCount === 0 && !loading ? (
        <p className="px-3 py-2 text-xs text-fg-muted">Nessun riferimento trovato.</p>
      ) : (
        <div className="px-1 py-1">
          {(['backlinks', 'mentions'] as const).map((section) => (
            <section key={section} className="mb-1">
              <SectionToggle
                collapsed={collapsed[section]}
                count={visibleReferences[section].length}
                label={SECTION_LABELS[section]}
                onToggle={(): void => {
                  toggleSection(section);
                }}
              />
              {!collapsed[section] && (
                <ul className="pb-1">
                  {visibleReferences[section].length === 0 ? (
                    <li className="px-6 py-1 text-xs text-fg-muted">Nessun risultato.</li>
                  ) : (
                    visibleReferences[section].map((reference) => (
                      <ReferenceRow
                        key={`${reference.kind}:${reference.sourcePath}`}
                        reference={reference}
                      />
                    ))
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
