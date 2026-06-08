import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { Popover } from '../ui/Popover';

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
 * Page-level type filter for the DatabaseView header. The anchored overlay
 * (positioning, viewport flip, outside-click / Escape dismissal, focus
 * return) is handled by the shared {@link Popover} primitive; this component
 * keeps its bespoke radio-list rows (label + icon + per-type count) since
 * those don't map onto the generic Menu item model.
 */
export function TypeFilterDropdown({ types, selectedType, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="min-h-7 max-w-52 truncate rounded border border-border bg-bg-subtle px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {buttonLabel}
      </button>
      <Popover
        open={open}
        onClose={(): void => setOpen(false)}
        anchor={{ kind: 'element', ref: triggerRef }}
        placement="bottom-start"
        role="menu"
        ariaLabel="Filtra per tipo"
        autoFocus={false}
        className="z-20 max-h-72 w-56 overflow-auto rounded-md border border-border bg-bg-subtle p-1 shadow-lg ziba-popover-in"
      >
        <button
          type="button"
          role="menuitemradio"
          aria-checked={selectedType === null}
          onClick={(): void => choose(null)}
          className={[
            'flex min-h-7 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
            selectedType === null
              ? 'bg-accent/10 text-fg'
              : 'text-fg-subtle hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:text-fg',
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
                'flex min-h-7 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                isActive
                  ? 'bg-accent/10 text-fg'
                  : 'text-fg-subtle hover:bg-bg-muted focus-visible:bg-bg-muted focus-visible:text-fg',
              ].join(' ')}
            >
              <span className="flex-1 truncate">{`${iconPrefix}${t.label}`}</span>
              <span className="tabular-nums text-fg-subtle">{`(${t.count})`}</span>
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
