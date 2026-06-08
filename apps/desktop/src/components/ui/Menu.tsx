import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { Popover, type PopoverAnchor, type PopoverPlacement } from './Popover';

export type MenuItem = {
  label: string;
  onSelect?: () => void;
  icon?: ReactNode;
  /** Style the row as destructive (red text). */
  destructive?: boolean;
  /** Disabled rows are visible but un-activatable / skipped by keyboard nav. */
  disabled?: boolean;
  /** Draw a divider before this row. */
  separatorBefore?: boolean;
  /** Child actions; activating this row opens a side submenu. */
  children?: MenuItem[];
};

export type MenuProps = {
  open: boolean;
  onClose: () => void;
  anchor: PopoverAnchor;
  items: MenuItem[];
  ariaLabel?: string;
  placement?: PopoverPlacement;
  /** Where to return focus on close (e.g. the right-clicked row). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
};

const MENU_CLASS = [
  'fixed',
  'z-50',
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
  'outline-none',
  // Subtle fade-in; disabled under reduced-motion via the keyframe's media query.
  'ziba-popover-in',
].join(' ');

/**
 * Keyboard-navigable menu built on {@link Popover}. Implements the WAI-ARIA
 * menu pattern: roving focus via Arrow/Home/End, Enter/Space to activate,
 * Escape to close, and `role="menu"`/`role="menuitem"`. Supports separators,
 * danger and disabled items, and a single level of trivial submenus (opened
 * on hover/focus/click, flipped inside the viewport by the nested Popover).
 *
 * Positioning, outside-click, Escape and focus-return all come from Popover.
 */
export function Menu({
  open,
  onClose,
  anchor,
  items,
  ariaLabel,
  placement = 'bottom-start',
  returnFocusRef,
  className,
}: MenuProps): JSX.Element | null {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      placement={placement}
      role="menu"
      autoFocus={false}
      className={className ?? MENU_CLASS}
      // Spread the optional props only when set so `exactOptionalPropertyTypes`
      // doesn't see an explicit `undefined`.
      {...(returnFocusRef !== undefined ? { returnFocusRef } : {})}
      {...(ariaLabel !== undefined ? { ariaLabel } : {})}
    >
      <MenuList items={items} onClose={onClose} autoFocusFirst />
    </Popover>
  );
}

/**
 * The interactive list inside a menu panel. Split out so submenus can reuse
 * the same roving-focus + activation logic. Manages its own active index.
 */
function MenuList({
  items,
  onClose,
  autoFocusFirst,
}: {
  items: MenuItem[];
  onClose: () => void;
  autoFocusFirst: boolean;
}): JSX.Element {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  // Open submenu, keyed by the parent item index, plus the trigger element
  // it anchors to.
  const [submenu, setSubmenu] = useState<{ index: number; trigger: HTMLButtonElement } | null>(
    null,
  );

  const enabledIndexes = items
    .map((item, idx) => (item.disabled === true ? -1 : idx))
    .filter((idx) => idx !== -1);

  // Focus the first enabled item when the root list opens, so keyboard
  // users land on an actionable row immediately.
  useEffect(() => {
    if (!autoFocusFirst) return;
    const first = enabledIndexes[0];
    if (first === undefined) return;
    const id = window.requestAnimationFrame(() => {
      itemRefs.current[first]?.focus();
      setActiveIndex(first);
    });
    return (): void => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusFirst]);

  const focusIndex = useCallback((idx: number): void => {
    itemRefs.current[idx]?.focus();
    setActiveIndex(idx);
  }, []);

  const move = useCallback(
    (dir: 1 | -1): void => {
      if (enabledIndexes.length === 0) return;
      const current = enabledIndexes.indexOf(activeIndex);
      const nextPos =
        current === -1
          ? dir === 1
            ? 0
            : enabledIndexes.length - 1
          : (current + dir + enabledIndexes.length) % enabledIndexes.length;
      const target = enabledIndexes[nextPos];
      if (target !== undefined) focusIndex(target);
    },
    [activeIndex, enabledIndexes, focusIndex],
  );

  const activate = useCallback(
    (item: MenuItem, index: number, trigger: HTMLButtonElement): void => {
      if (item.disabled === true) return;
      const hasChildren = item.children !== undefined && item.children.length > 0;
      if (hasChildren) {
        setSubmenu({ index, trigger });
        return;
      }
      if (item.onSelect === undefined) return;
      // Close FIRST so a re-render of the host (e.g. the tree) doesn't see
      // the menu open with a stale target.
      onClose();
      item.onSelect();
    },
    [onClose],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, item: MenuItem, index: number): void => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1);
          break;
        case 'Home': {
          e.preventDefault();
          const first = enabledIndexes[0];
          if (first !== undefined) focusIndex(first);
          break;
        }
        case 'End': {
          e.preventDefault();
          const last = enabledIndexes[enabledIndexes.length - 1];
          if (last !== undefined) focusIndex(last);
          break;
        }
        case 'Enter':
        case ' ':
          e.preventDefault();
          activate(item, index, e.currentTarget);
          break;
        case 'ArrowRight':
          if (item.children !== undefined && item.children.length > 0) {
            e.preventDefault();
            setSubmenu({ index, trigger: e.currentTarget });
          }
          break;
        case 'ArrowLeft':
          // Inside a submenu ArrowLeft closes it; at root it's a no-op.
          break;
        default:
          break;
      }
    },
    [activate, enabledIndexes, focusIndex, move],
  );

  return (
    <>
      {items.map((item, index) => {
        const hasChildren = item.children !== undefined && item.children.length > 0;
        const isSubmenuOpen = submenu?.index === index;
        return (
          <div key={`${index}-${item.label}`}>
            {item.separatorBefore === true && (
              <div role="separator" className="mx-1 my-0.5 h-px bg-border" />
            )}
            <button
              ref={(node): void => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? isSubmenuOpen : undefined}
              aria-disabled={item.disabled === true ? true : undefined}
              disabled={item.disabled}
              onMouseEnter={(event): void => {
                if (item.disabled === true) return;
                if (hasChildren) {
                  setSubmenu({ index, trigger: event.currentTarget });
                } else {
                  // Leaving a sibling closes any open submenu.
                  setSubmenu(null);
                }
                setActiveIndex(index);
              }}
              onFocus={(event): void => {
                if (item.disabled === true) return;
                if (hasChildren) setSubmenu({ index, trigger: event.currentTarget });
                setActiveIndex(index);
              }}
              onClick={(event): void => activate(item, index, event.currentTarget)}
              onKeyDown={(event): void => onKeyDown(event, item, index)}
              className={menuItemClass(item, isSubmenuOpen)}
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
                  (isSubmenuOpen ? 'text-fg' : 'text-fg-muted')
                }
              >
                {hasChildren ? '>' : ''}
              </span>
            </button>
            {hasChildren && isSubmenuOpen && submenu !== null && (
              <Submenu
                trigger={submenu.trigger}
                items={item.children ?? []}
                onClose={onClose}
                onDismiss={(): void => setSubmenu(null)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * A side submenu anchored to its parent row. Reuses Popover for flip +
 * positioning (the parent row is the element anchor; `top-start` keeps the
 * top edges roughly aligned and the flip handles right/left + clamping).
 */
function Submenu({
  trigger,
  items,
  onClose,
  onDismiss,
}: {
  trigger: HTMLButtonElement;
  items: MenuItem[];
  onClose: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const triggerRef = useRef<HTMLElement | null>(trigger);
  triggerRef.current = trigger;
  const anchor: PopoverAnchor = { kind: 'element', ref: triggerRef };

  return (
    <Popover
      open
      onClose={onDismiss}
      anchor={anchor}
      // Anchor to the right of the row by default; the horizontal flip in
      // Popover pulls it to the left when it would overflow the viewport.
      placement="right-start"
      offset={SUBMENU_GAP}
      autoFocus={false}
      restoreFocus={false}
      role="menu"
      className={[
        'fixed z-[60] min-w-[11rem] rounded-md border border-border/90 bg-bg-subtle py-0.5',
        'text-[12px] leading-4 shadow-lg shadow-black/15 outline-none',
        'ziba-popover-in',
      ].join(' ')}
    >
      <MenuList items={items} onClose={onClose} autoFocusFirst={false} />
    </Popover>
  );
}

const SUBMENU_GAP = 4;

function menuItemClass(item: MenuItem, active: boolean): string {
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
