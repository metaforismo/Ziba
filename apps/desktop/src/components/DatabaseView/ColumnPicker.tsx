import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

type Props = {
  /** All distinct property keys discovered in the current result, sorted. */
  availableProperties: string[];
  /**
   * Schema-derived keys to surface at the top of the menu in a
   * dedicated "Suggerite" group. Empty array (or omitted) suppresses
   * the group entirely. Keys overlapping with `availableProperties`
   * are deduplicated to the suggested group so each key shows once.
   */
  suggestedKeys?: ReadonlyArray<string>;
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
  suggestedKeys,
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
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const visibleSet = new Set(visibleColumns);

  const suggested = suggestedKeys ?? [];
  const suggestedSet = new Set(suggested);
  const restProperties = availableProperties.filter((k) => !suggestedSet.has(k));

  const toggle = (key: string): void => {
    if (visibleSet.has(key)) {
      onChange(visibleColumns.filter((k) => k !== key));
      return;
    }
    // Keep stable column order. Keys that exist in availableProperties
    // slot into their alphabetical position; schema-suggested keys
    // absent from availableProperties append at the end. The sort
    // comparator handles both cases by treating -1 as "after any
    // known key".
    const next = [...visibleColumns, key].sort((a, b) => {
      const ai = availableProperties.indexOf(a);
      const bi = availableProperties.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    onChange(next);
  };

  const renderRow = (key: string): JSX.Element => {
    const checked = visibleSet.has(key);
    return (
      <label
        key={key}
        className="flex min-h-7 cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted focus-within:bg-bg-muted focus-within:text-fg"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(): void => toggle(key)}
          className="h-3 w-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <span className="truncate">{key}</span>
      </label>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={(): void => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="min-h-7 rounded border border-border bg-bg-subtle px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Colonne ({visibleColumns.length})
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Colonne visibili"
          className="absolute right-0 top-[calc(100%+4px)] z-20 max-h-72 w-56 overflow-auto rounded-md border border-border bg-bg-subtle p-1 shadow-lg"
        >
          {suggested.length > 0 && (
            <>
              <p className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                Suggerite
              </p>
              {suggested.map((k) => renderRow(k))}
              {restProperties.length > 0 && (
                <div role="separator" className="my-1 border-t border-border" />
              )}
            </>
          )}
          {restProperties.length === 0 && suggested.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-fg-muted">Nessuna proprietà rilevata.</p>
          )}
          {restProperties.map((k) => renderRow(k))}
        </div>
      )}
    </div>
  );
}
