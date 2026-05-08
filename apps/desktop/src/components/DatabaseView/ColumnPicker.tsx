import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

type Props = {
  /** All distinct property keys discovered in the current result, sorted. */
  availableProperties: string[];
  /** Property keys currently selected as visible columns. */
  visibleColumns: string[];
  onChange(next: string[]): void;
};

/**
 * Lightweight dropdown for toggling which property keys appear as columns
 * in the database table. We keep state local (open/closed) — selection
 * lives in the parent so the table can pick it up immediately.
 *
 * Rationale for not using `<details>`/`<summary>`: those pop the dropdown
 * inline (pushing layout) and don't auto-close on outside-click, which is
 * the behaviour users expect from a multi-select.
 */
export function ColumnPicker({
  availableProperties,
  visibleColumns,
  onChange,
}: Props): JSX.Element {
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
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const visibleSet = new Set(visibleColumns);

  const toggle = (key: string): void => {
    if (visibleSet.has(key)) {
      onChange(visibleColumns.filter((k) => k !== key));
    } else {
      // Preserve the alphabetical-then-append order: if the key sits in
      // `availableProperties` between two already-visible keys, slot it
      // there; otherwise append. Keeps column order stable as the user
      // toggles.
      const next = [...visibleColumns, key].sort((a, b) => {
        return availableProperties.indexOf(a) - availableProperties.indexOf(b);
      });
      onChange(next);
    }
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
        Colonne ({visibleColumns.length})
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Colonne visibili"
          className="absolute right-0 top-[calc(100%+4px)] z-20 max-h-72 w-56 overflow-auto rounded-md border border-border bg-bg-subtle p-1 shadow-lg"
        >
          {availableProperties.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-fg-muted">Nessuna proprietà rilevata.</p>
          )}
          {availableProperties.map((key) => {
            const checked = visibleSet.has(key);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(): void => toggle(key)}
                  className="h-3 w-3"
                />
                <span className="truncate">{key}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
