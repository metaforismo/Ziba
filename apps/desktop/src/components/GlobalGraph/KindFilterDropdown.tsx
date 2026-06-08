import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { kindToHsl } from '../../lib/kind-color';

type Props = {
  /** All distinct relation kinds present in the current graph (excluding the empty sentinel). */
  kinds: ReadonlyArray<string>;
  /** Currently active kinds. Empty set = no filter (all shown). */
  selectedKinds: ReadonlySet<string>;
  onChange(next: ReadonlySet<string>): void;
  /** True when the graph contains soft references — offers the toggle. */
  hasMentions: boolean;
  /** Whether soft references (unlinked mentions) are currently shown. */
  showMentions: boolean;
  onShowMentionsChange(next: boolean): void;
};

/** Edge color for soft references in the swatch — matches the Canvas. */
const MENTION_SWATCH = 'rgb(var(--graph-edge-mention))';

/**
 * Multi-select dropdown for relation kinds. Each option is rendered
 * with its kind-hash color swatch so users can map the kind name to
 * the edge color they see in the graph. Empty selection means
 * "no filter" — all kinds render at full opacity.
 */
export function KindFilterDropdown({
  kinds,
  selectedKinds,
  onChange,
  hasMentions,
  showMentions,
  onShowMentionsChange,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      const node = containerRef.current;
      if (node === null) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return (): void => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const activeFilterCount = selectedKinds.size + (hasMentions && !showMentions ? 1 : 0);
  const buttonLabel =
    activeFilterCount === 0 ? 'Filtra relazioni: Tutte' : `Filtra relazioni (${activeFilterCount})`;

  const toggle = (kind: string): void => {
    const next = new Set(selectedKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    onChange(next);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-8 rounded-md border border-graph-edge bg-graph-surface/84 px-2 text-[12px] text-graph-text-muted shadow-lg shadow-black/10 backdrop-blur transition hover:border-graph-border-strong hover:bg-graph-hover hover:text-graph-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-graph-selection/40"
      >
        {buttonLabel}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filtra per tipo di relazione"
          className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-56 overflow-auto rounded-md border border-graph-edge bg-graph-surface p-1 shadow-xl shadow-black/30"
        >
          {hasMentions && (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-graph-text hover:bg-graph-hover">
                <input
                  type="checkbox"
                  checked={showMentions}
                  onChange={(): void => onShowMentionsChange(!showMentions)}
                  className="h-3 w-3 accent-graph-node"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-0 w-3 shrink-0 border-t border-dashed"
                  style={{ borderColor: MENTION_SWATCH }}
                />
                <span className="truncate">Riferimenti deboli</span>
              </label>
              {kinds.length > 0 && <div className="my-1 h-px bg-graph-edge" />}
            </>
          )}
          {kinds.length === 0 && !hasMentions && (
            <p className="px-2 py-1.5 text-xs italic text-graph-text-muted">
              Nessuna relazione tipizzata nel grafo.
            </p>
          )}
          {kinds.map((k) => {
            const checked = selectedKinds.has(k);
            return (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-graph-text hover:bg-graph-hover"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(): void => toggle(k)}
                  className="h-3 w-3 accent-graph-node"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: kindToHsl(k) }}
                />
                <span className="truncate">{k}</span>
              </label>
            );
          })}
          {selectedKinds.size > 0 && (
            <button
              type="button"
              onClick={(): void => onChange(new Set())}
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-graph-text-muted hover:bg-graph-hover hover:text-graph-text"
            >
              Mostra tutte
            </button>
          )}
        </div>
      )}
    </div>
  );
}
