import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

type MenuPosition = {
  left: number;
  top: number;
};

type SubmenuState = MenuPosition & {
  key: string;
  items: ContextMenuItem[];
};

const VIEWPORT_PADDING = 6;
const SUBMENU_GAP = 4;
const ESTIMATED_MENU_WIDTH = 176;
const ESTIMATED_ROW_HEIGHT = 28;
const ESTIMATED_SEPARATOR_HEIGHT = 5;
const MENU_VERTICAL_PADDING = 6;

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
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ left: x, top: y });
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);

  useEffect(() => {
    setMenuPosition({ left: x, top: y });
    setOpenSubmenu(null);
    setSubmenu(null);
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const node = ref.current;
      if (node === null) return;
      if (!(e.target instanceof Node)) return;
      const submenuNode = submenuRef.current;
      const clickedSubmenu = submenuNode !== null && submenuNode.contains(e.target);
      if (!node.contains(e.target) && !clickedSubmenu) {
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

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const next = fitInViewport(menuPosition.left, menuPosition.top, rect.width, rect.height);
    if (next.left !== menuPosition.left || next.top !== menuPosition.top) {
      setMenuPosition(next);
    }
  }, [items.length, menuPosition.left, menuPosition.top]);

  const openChildMenu = useCallback(
    (key: string, childItems: ContextMenuItem[], trigger: HTMLButtonElement): void => {
      const triggerRect = trigger.getBoundingClientRect();
      const next = positionSubmenu(
        triggerRect,
        ESTIMATED_MENU_WIDTH,
        estimateMenuHeight(childItems),
      );
      setOpenSubmenu(key);
      setSubmenu({ key, items: childItems, left: next.left, top: next.top });
    },
    [],
  );

  useEffect(() => {
    if (submenu === null) return;
    const trigger = triggerRefs.current.get(submenu.key);
    const node = submenuRef.current;
    if (trigger === undefined || node === null) return;

    const triggerRect = trigger.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    const next = positionSubmenu(
      triggerRect,
      rect.width || ESTIMATED_MENU_WIDTH,
      rect.height || estimateMenuHeight(submenu.items),
    );
    if (next.left !== submenu.left || next.top !== submenu.top) {
      setSubmenu({ ...submenu, left: next.left, top: next.top });
    }
  }, [submenu]);

  if (typeof document === 'undefined') return null;

  const renderItems = (menuItems: ContextMenuItem[], prefix: string): JSX.Element[] =>
    menuItems.map((item, idx) => {
      const key = `${prefix}-${idx}-${item.label}`;
      const hasChildren = item.children !== undefined && item.children.length > 0;
      const isOpen = hasChildren && openSubmenu === key;
      return (
        <div key={key}>
          {item.separatorBefore === true && (
            <div role="separator" className="mx-1 my-0.5 h-px bg-border" />
          )}
          <button
            ref={(node): void => {
              if (node === null) {
                triggerRefs.current.delete(key);
                return;
              }
              if (hasChildren) triggerRefs.current.set(key, node);
            }}
            type="button"
            role="menuitem"
            aria-haspopup={hasChildren ? 'menu' : undefined}
            aria-expanded={hasChildren ? isOpen : undefined}
            disabled={item.disabled}
            onMouseEnter={(event): void => {
              if (item.disabled) return;
              if (hasChildren && item.children !== undefined) {
                openChildMenu(key, item.children, event.currentTarget);
              } else if (prefix === 'root') {
                setOpenSubmenu(null);
                setSubmenu(null);
              }
            }}
            onFocus={(event): void => {
              if (item.disabled) return;
              if (hasChildren && item.children !== undefined) {
                openChildMenu(key, item.children, event.currentTarget);
              }
            }}
            onClick={(event): void => {
              if (item.disabled) return;
              if (hasChildren && item.children !== undefined) {
                openChildMenu(key, item.children, event.currentTarget);
                return;
              }
              if (item.onSelect === undefined) return;
              // Close FIRST so a re-render of the tree doesn't see the
              // menu open with a stale target.
              onClose();
              item.onSelect();
            }}
            className={menuItemClass(item, isOpen)}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center text-current"
            >
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span
              aria-hidden="true"
              className={
                'ml-2 inline-flex w-3 shrink-0 justify-end ' +
                (isOpen ? 'text-fg' : 'text-fg-muted')
              }
            >
              {hasChildren ? '>' : ''}
            </span>
          </button>
        </div>
      );
    });

  return createPortal(
    <>
      <div
        ref={ref}
        role="menu"
        style={{ left: menuPosition.left, top: menuPosition.top }}
        className={menuClass('z-50')}
      >
        {renderItems(items, 'root')}
      </div>
      {submenu !== null && (
        <div
          ref={submenuRef}
          role="menu"
          style={{ left: submenu.left, top: submenu.top }}
          className={menuClass('z-[60]')}
        >
          {renderItems(submenu.items, submenu.key)}
        </div>
      )}
    </>,
    document.body,
  );
}

function menuClass(zIndex: string): string {
  return [
    'fixed',
    zIndex,
    'min-w-[11rem]',
    'rounded-md',
    'border',
    'border-border/90',
    'bg-bg-subtle',
    'py-0.5',
    'text-[12px]',
    'leading-4',
    'shadow-lg',
    'shadow-black/15',
  ].join(' ');
}

function menuItemClass(item: ContextMenuItem, active: boolean): string {
  const base = 'flex h-7 w-full items-center gap-2 px-2 text-left outline-none transition-colors';
  if (item.disabled === true) {
    return `${base} cursor-not-allowed text-fg-muted/60`;
  }
  if (item.destructive === true) {
    return `${base} text-red-500 hover:bg-bg-muted focus-visible:bg-bg-muted`;
  }
  return `${base} ${
    active
      ? 'bg-bg-muted text-fg'
      : 'text-fg-subtle hover:bg-bg-muted hover:text-fg focus-visible:bg-bg-muted focus-visible:text-fg'
  }`;
}

function estimateMenuHeight(items: ContextMenuItem[]): number {
  const separatorCount = items.filter((item) => item.separatorBefore === true).length;
  return (
    MENU_VERTICAL_PADDING +
    items.length * ESTIMATED_ROW_HEIGHT +
    separatorCount * ESTIMATED_SEPARATOR_HEIGHT
  );
}

function positionSubmenu(triggerRect: DOMRect, width: number, height: number): MenuPosition {
  const rightLeft = triggerRect.right + SUBMENU_GAP;
  const leftLeft = triggerRect.left - width - SUBMENU_GAP;
  const rightFits = rightLeft + width <= window.innerWidth - VIEWPORT_PADDING;
  const left = rightFits || leftLeft < VIEWPORT_PADDING ? rightLeft : leftLeft;
  return fitInViewport(left, triggerRect.top - 1, width, height);
}

function fitInViewport(left: number, top: number, width: number, height: number): MenuPosition {
  const safeWidth = width || ESTIMATED_MENU_WIDTH;
  const safeHeight = height || ESTIMATED_ROW_HEIGHT;
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - safeWidth - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - safeHeight - VIEWPORT_PADDING);
  return {
    left: Math.min(Math.max(left, VIEWPORT_PADDING), maxLeft),
    top: Math.min(Math.max(top, VIEWPORT_PADDING), maxTop),
  };
}
