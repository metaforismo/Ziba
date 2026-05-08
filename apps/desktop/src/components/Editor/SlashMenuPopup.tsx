import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SlashMenuItem } from './extensions/SlashCommand';

export type SlashMenuPopupProps = {
  items: SlashMenuItem[];
  selectedIndex: number;
  /** Page-coordinate position of the trigger range (the slash). */
  position: { top: number; left: number; bottom: number };
  onSelect(item: SlashMenuItem): void;
  onHover(index: number): void;
};

const POPUP_HEIGHT_ESTIMATE = 288; // matches max-h-72 (18rem) at default size

/**
 * Floating list of slash-command suggestions. Mirrors the
 * `WikilinkPopup` architecture:
 *   - Portal to `document.body` so editor overflow doesn't clip us.
 *   - Fixed positioning anchored at the slash; flips above the cursor
 *     when there isn't enough room below.
 *   - Keyboard handling lives in the suggestion plugin's `onKeyDown`;
 *     this component is presentation-only.
 *   - `onMouseDown` (not `onClick`) so the editor doesn't lose focus
 *     before the selection commits — `onClick` would let `onExit`
 *     destroy the popup mid-click.
 */
export function SlashMenuPopup(props: SlashMenuPopupProps): JSX.Element | null {
  const { items, selectedIndex, position, onSelect, onHover } = props;
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active row into view as ArrowUp/Down moves through
  // the list. `block: 'nearest'` keeps the scroll subtle — we don't
  // want to recenter on every keystroke.
  useEffect(() => {
    const root = listRef.current;
    if (root === null) return;
    const active = root.querySelector<HTMLElement>(`[data-index="${String(selectedIndex)}"]`);
    if (active === null) return;
    active.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Flip the popup above the trigger when there isn't enough room
  // below. We don't measure post-mount because the popup height is
  // capped by max-h-72 and the estimate matches; over-engineering the
  // placement here would mean pulling in Floating UI for no real win.
  const placement = useMemo(() => {
    if (typeof window === 'undefined') {
      return { top: position.bottom + 4, left: position.left };
    }
    const viewportBottom = window.innerHeight;
    const wouldOverflow = position.bottom + POPUP_HEIGHT_ESTIMATE > viewportBottom;
    if (wouldOverflow && position.top - POPUP_HEIGHT_ESTIMATE > 0) {
      return {
        top: position.top - POPUP_HEIGHT_ESTIMATE - 4,
        left: position.left,
      };
    }
    return { top: position.bottom + 4, left: position.left };
  }, [position.top, position.bottom, position.left]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="Menu comandi"
      className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-bg-subtle shadow-lg"
      style={{ top: placement.top, left: placement.left }}
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-fg-muted">Nessun comando trovato</div>
      ) : (
        items.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-index={idx}
              onMouseDown={(e): void => {
                // Prevent the editor from losing focus before our click
                // handler runs — otherwise the suggestion plugin's
                // `onExit` tears down on blur and the click never
                // reaches `onSelect`.
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={(): void => onHover(idx)}
              className={[
                'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
                isSelected ? 'bg-accent/10 text-fg' : 'bg-transparent text-fg hover:bg-bg',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-bg text-xs font-medium text-fg-subtle"
              >
                {item.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{item.title}</span>
                <span className="truncate text-xs text-fg-muted">{item.description}</span>
              </span>
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}
