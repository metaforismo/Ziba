import type { JSX } from 'react';
import { Menu, type MenuItem } from '../ui/Menu';

/**
 * Re-exported under the historical name so call sites (Sidebar) keep
 * importing `ContextMenuItem`. The shape is the shared `MenuItem` — the
 * old bespoke type had the same fields (label, onSelect, icon, destructive,
 * disabled, separatorBefore, children).
 */
export type ContextMenuItem = MenuItem;

export type TreeContextMenuProps = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

/**
 * Right-click context menu for the file tree. Thin wrapper over the shared
 * {@link Menu} primitive anchored to the cursor coordinates: positioning,
 * viewport flip, outside-click / Escape dismissal, keyboard roving focus,
 * and the side submenu all come from Menu/Popover now.
 */
export function TreeContextMenu({
  x,
  y,
  items,
  onClose,
}: TreeContextMenuProps): JSX.Element | null {
  return (
    <Menu
      open
      onClose={onClose}
      anchor={{ kind: 'point', x, y }}
      items={items}
      ariaLabel="Azioni"
    />
  );
}
