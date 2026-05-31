import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  label: string;
  onSelect?: () => void;
  icon?: ReactNode;
  /** Style the row as destructive (red text). */
  destructive?: boolean;
  /** Disabled rows are visible but un-clickable. */
  disabled?: boolean;
  /** Draw a divider before this row. */
  separatorBefore?: boolean;
  /** Child actions shown after activating this row. */
  children?: ContextMenuItem[];
};

export type TreeContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

/**
 * Small portal-rendered context menu positioned at the click coordinates.
 * Closes on outside click, Escape, or any item selection. The menu reflows
 * itself if it would overflow the viewport.
 */
export function TreeContextMenu({
  x,
  y,
  items,
  onClose,
}: TreeContextMenuProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const node = ref.current;
      if (node === null) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    // `mousedown` (not `click`) so we close before a fresh selection
    // dispatches its own click somewhere else.
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Reflow against the viewport: if the menu would overflow right/bottom,
  // shift it back inside. We use a layout effect via ref measurement on
  // first render; a fixed estimated size is fine because the menu is
  // always small.
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (rect.right > vw) dx = vw - rect.right - 4;
    if (rect.bottom > vh) dy = vh - rect.bottom - 4;
    if (dx !== 0 || dy !== 0) {
      node.style.left = `${x + dx}px`;
      node.style.top = `${y + dy}px`;
    }
  }, [x, y]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[12rem] rounded-md border border-border bg-bg py-1 shadow-lg"
    >
      {items.map((item, idx) => {
        const key = `${idx}-${item.label}`;
        const hasChildren = item.children !== undefined && item.children.length > 0;
        return (
          <div key={key}>
            {item.separatorBefore === true && (
              <div role="separator" className="my-1 border-t border-border" />
            )}
            <button
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? openSubmenu === key : undefined}
              disabled={item.disabled}
              onClick={(): void => {
                if (item.disabled) return;
                if (hasChildren) {
                  setOpenSubmenu((current) => (current === key ? null : key));
                  return;
                }
                if (item.onSelect === undefined) return;
                // Close FIRST so a re-render of the tree doesn't see the
                // menu open with a stale target.
                onClose();
                item.onSelect();
              }}
              className={
                'flex min-h-8 w-full items-center gap-2 px-3 py-1.5 text-left text-sm ' +
                (item.disabled
                  ? 'cursor-not-allowed text-fg-muted'
                  : item.destructive
                    ? 'text-red-500 hover:bg-bg-muted'
                    : 'text-fg hover:bg-bg-muted')
              }
            >
              {item.icon !== undefined && (
                <span className="inline-flex size-4 shrink-0 items-center justify-center text-current">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {hasChildren && (
                <span aria-hidden="true" className="text-fg-muted">
                  {'>'}
                </span>
              )}
            </button>
            {hasChildren && openSubmenu === key && (
              <div role="menu" className="border-y border-border bg-bg-subtle py-1">
                {item.children?.map((child, childIdx) => (
                  <button
                    key={`${childIdx}-${child.label}`}
                    type="button"
                    role="menuitem"
                    disabled={child.disabled}
                    onClick={(): void => {
                      if (child.disabled || child.onSelect === undefined) return;
                      onClose();
                      child.onSelect();
                    }}
                    className={
                      'flex min-h-8 w-full items-center gap-2 px-8 py-1.5 text-left text-sm ' +
                      (child.disabled
                        ? 'cursor-not-allowed text-fg-muted'
                        : child.destructive
                          ? 'text-red-500 hover:bg-bg-muted'
                          : 'text-fg hover:bg-bg-muted')
                    }
                  >
                    {child.icon !== undefined && (
                      <span className="inline-flex size-4 shrink-0 items-center justify-center text-current">
                        {child.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
