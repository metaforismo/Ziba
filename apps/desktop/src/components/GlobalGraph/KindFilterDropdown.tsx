import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { kindToHsl } from '../../lib/kind-color';

type Props = {
  /** All distinct relation kinds present in the current graph (excluding the empty sentinel). */
  kinds: ReadonlyArray<string>;
  /** Currently active kinds. Empty set = no filter (all shown). */
  selectedKinds: ReadonlySet<string>;
  onChange(next: ReadonlySet<string>): void;
};

/**
 * Multi-select dropdown for relation kinds. Each option is rendered
 * with its kind-hash color swatch so users can map the kind name to
 * the edge color they see in the graph. Empty selection means
 * "no filter" — all kinds render at full opacity.
 */
export function KindFilterDropdown({ kinds, selectedKinds, onChange }: Props): JSX.Element {
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

  const buttonLabel =
    selectedKinds.size === 0
      ? 'Filtra relazioni: Tutte'
      : `Filtra relazioni (${selectedKinds.size})`;

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
        className="h-8 rounded-md border border-[#3a3a3f] bg-[#242426]/84 px-2 text-[12px] text-[#bfc0c6] shadow-lg shadow-black/10 backdrop-blur transition hover:border-[#4d4d54] hover:bg-[#303034] hover:text-[#f4f4f5]"
      >
        {buttonLabel}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filtra per tipo di relazione"
          className="absolute right-0 top-[calc(100%+6px)] z-20 max-h-72 w-56 overflow-auto rounded-md border border-[#3a3a3f] bg-[#242426] p-1 shadow-xl shadow-black/30"
        >
          {kinds.length === 0 && (
            <p className="px-2 py-1.5 text-xs italic text-[#9d9da4]">
              Nessuna relazione tipizzata nel grafo.
            </p>
          )}
          {kinds.map((k) => {
            const checked = selectedKinds.has(k);
            return (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-[#d2d2d7] hover:bg-[#303034]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(): void => toggle(k)}
                  className="h-3 w-3 accent-[#d7d7da]"
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
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-[#9d9da4] hover:bg-[#303034] hover:text-[#f4f4f5]"
            >
              Mostra tutte
            </button>
          )}
        </div>
      )}
    </div>
  );
}
