import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  label: string;
  onSelect: () => void;
  /** Style the row as destructive (red text). */
  destructive?: boolean;
  /** Disabled rows are visible but un-clickable. */
  disabled?: boolean;
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
      {items.map((item, idx) => (
        <button
          key={`${idx}-${item.label}`}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={(): void => {
            if (item.disabled) return;
            // Close FIRST so a re-render of the tree doesn't see the
            // menu open with a stale target.
            onClose();
            item.onSelect();
          }}
          className={
            'block w-full px-3 py-1.5 text-left text-sm ' +
            (item.disabled
              ? 'cursor-not-allowed text-fg-muted'
              : item.destructive
                ? 'text-red-500 hover:bg-bg-muted'
                : 'text-fg hover:bg-bg-muted')
          }
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
