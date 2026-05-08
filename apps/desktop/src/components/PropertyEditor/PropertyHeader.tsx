import { useEffect, useRef, useState } from 'react';
import type { PropertyType, SwitchableType } from './types';
import { SWITCHABLE_TYPES } from './types';

export type PropertyHeaderProps = {
  /** Current key name. Click to rename in place. */
  name: string;
  /** Detected (or user-overridden) type for this row. */
  type: PropertyType;
  /**
   * Subset of SWITCHABLE_TYPES the user is allowed to switch INTO from
   * the current type. We pre-compute it in the parent so the header
   * doesn't need to re-implement the safety rules.
   */
  switchableTo: readonly SwitchableType[];
  /**
   * Validate a candidate new name. Returning a non-empty string keeps
   * the row in edit mode and surfaces the message; returning null
   * commits the rename. The parent owns the uniqueness check.
   */
  validateRename: (next: string) => string | null;
  onRename: (next: string) => void;
  onSwitchType: (next: SwitchableType) => void;
  onDelete: () => void;
};

const TYPE_LABEL: Record<PropertyType, string> = {
  text: 'Testo',
  number: 'Numero',
  boolean: 'Booleano',
  date: 'Data',
  url: 'URL',
  'multi-select': 'Multi-select',
  tags: 'Tag',
  unsupported: 'Non supportato',
};

const TYPE_GLYPH: Record<PropertyType, string> = {
  text: 'Aa',
  number: '#',
  boolean: '☑',
  date: '📅',
  url: '🔗',
  'multi-select': '⋯',
  tags: '#',
  unsupported: '?',
};

const SWITCHABLE_LABEL: Record<SwitchableType, string> = {
  text: TYPE_LABEL.text,
  number: TYPE_LABEL.number,
  date: TYPE_LABEL.date,
  url: TYPE_LABEL.url,
};

/**
 * Left-column row component: type icon (click to switch), inline-editable
 * key name, hover-revealed delete button. The header is intentionally
 * compact (~28px tall) to match the dense Notion-style row rhythm.
 */
export function PropertyHeader({
  name,
  type,
  switchableTo,
  validateRename,
  onRename,
  onSwitchType,
  onDelete,
}: PropertyHeaderProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Re-sync the draft when an external rename lands while we're not
  // editing — otherwise the next click-to-edit would show a stale name.
  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing && inputRef.current !== null) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // Click-outside dismissal for the type-switcher menu. We attach to
  // mousedown so a click on a menu item still fires `onClick` before
  // the menu unmounts.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      if (menuRef.current === null) return;
      if (e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return (): void => {
      document.removeEventListener('mousedown', onDocMouseDown);
    };
  }, [menuOpen]);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === name) {
      setEditing(false);
      setError(null);
      return;
    }
    const validationError = validateRename(trimmed);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    onRename(trimmed);
    setEditing(false);
    setError(null);
  };

  const cancel = (): void => {
    setDraft(name);
    setEditing(false);
    setError(null);
  };

  return (
    <div className="group/header flex h-7 w-[140px] shrink-0 items-center gap-1 px-1">
      <div className="relative">
        <button
          type="button"
          onClick={(): void => {
            if (switchableTo.length === 0) return;
            setMenuOpen((v) => !v);
          }}
          disabled={switchableTo.length === 0}
          title={`Tipo: ${TYPE_LABEL[type]}`}
          aria-label={`Tipo: ${TYPE_LABEL[type]}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-fg-muted hover:bg-bg-muted hover:text-fg disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span aria-hidden="true">{TYPE_GLYPH[type]}</span>
        </button>
        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded border border-border bg-bg shadow-lg"
          >
            {switchableTo.map((t) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                onClick={(): void => {
                  setMenuOpen(false);
                  onSwitchType(t);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
              >
                <span aria-hidden="true" className="w-4 text-center">
                  {TYPE_GLYPH[t]}
                </span>
                <span>{SWITCHABLE_LABEL[t]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e): void => {
              setDraft(e.target.value);
              setError(null);
            }}
            onBlur={commit}
            onKeyDown={(e): void => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            className="w-full rounded border border-accent bg-bg-subtle px-1 py-0.5 text-xs text-fg outline-none"
          />
          {error !== null && (
            <span className="absolute mt-6 rounded bg-bg px-1 text-[10px] text-red-500 shadow">
              {error}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={(): void => setEditing(true)}
          title="Rinomina proprietà"
          className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs font-medium text-fg-subtle hover:bg-bg-muted hover:text-fg"
        >
          {name.length === 0 ? <span className="italic text-fg-muted">senza nome</span> : name}
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        title="Elimina proprietà"
        aria-label="Elimina proprietà"
        className="invisible h-5 w-5 shrink-0 rounded text-xs text-fg-muted hover:bg-bg-muted hover:text-red-500 group-hover/header:visible"
      >
        ×
      </button>
    </div>
  );
}

/** Re-export so the parent can compute `switchableTo` without re-typing it. */
export { SWITCHABLE_TYPES };
