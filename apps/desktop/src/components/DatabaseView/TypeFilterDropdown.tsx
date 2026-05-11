import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

export type TypeFilterOption = {
  /** Type slug (e.g. `book`). */
  id: string;
  /** Display label — schema label, or the slug as a fallback. */
  label: string;
  /** Optional emoji / glyph from the schema. */
  icon: string | null;
  /** Number of notes carrying this type. */
  count: number;
};

type Props = {
  types: ReadonlyArray<TypeFilterOption>;
  selectedType: string | null;
  onChange(type: string | null): void;
};

/**
 * Page-level type filter for the DatabaseView header. Mirrors the
 * ColumnPicker dropdown's architecture: local open/closed state,
 * close on outside-click via mousedown, no portal (the header has
 * room for an absolute-positioned menu).
 */
export function TypeFilterDropdown({ types, selectedType, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on click-outside. Using mousedown rather than click so the
  // dropdown closes before the would-be click target receives focus —
  // same pattern as the search palette.
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

  const activeOption =
    selectedType === null ? null : (types.find((t) => t.id === selectedType) ?? null);
  const buttonLabel = ((): string => {
    if (selectedType === null) return 'Tipo: Tutti';
    if (activeOption === null) return `Tipo: ${selectedType}`;
    const icon =
      activeOption.icon !== null && activeOption.icon !== '' ? `${activeOption.icon} ` : '';
    return `Tipo: ${icon}${activeOption.label}`;
  })();

  const choose = (next: string | null): void => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded border border-border bg-bg-subtle px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
      >
        {buttonLabel}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filtra per tipo"
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-72 w-56 overflow-auto rounded-md border border-border bg-bg-subtle p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={selectedType === null}
            onClick={(): void => choose(null)}
            className={[
              'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
              selectedType === null ? 'bg-accent/10 text-fg' : 'text-fg-subtle hover:bg-bg-muted',
            ].join(' ')}
          >
            <span className="flex-1 truncate">Tutti</span>
          </button>
          {types.length === 0 && (
            <p className="px-2 py-1.5 text-xs italic text-fg-muted">Nessun tipo nel vault.</p>
          )}
          {types.map((t) => {
            const isActive = t.id === selectedType;
            const iconPrefix = t.icon !== null && t.icon !== '' ? `${t.icon} ` : '';
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={(): void => choose(t.id)}
                className={[
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs',
                  isActive ? 'bg-accent/10 text-fg' : 'text-fg-subtle hover:bg-bg-muted',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{`${iconPrefix}${t.label}`}</span>
                <span className="tabular-nums text-fg-muted">{`(${t.count})`}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
