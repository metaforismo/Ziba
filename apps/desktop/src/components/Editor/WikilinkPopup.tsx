import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { WikilinkSuggestionItem } from './extensions/WikilinkSuggestion';

export type WikilinkPopupProps = {
  items: WikilinkSuggestionItem[];
  selectedIndex: number;
  query: string;
  /** Page-coordinate position of the trigger range. */
  position: { top: number; left: number; bottom: number };
  onSelect(item: WikilinkSuggestionItem): void;
  onHover(index: number): void;
};

const MAX_VISIBLE = 8;
const POPUP_HEIGHT_ESTIMATE = 240;

/**
 * Floating list of wikilink suggestions. Rendered into `document.body`
 * via a portal so it can escape the editor's overflow:hidden / position
 * contexts. Positioning is "below the trigger by default, above when
 * the trigger is too close to the viewport bottom".
 *
 * Keyboard handling lives in the suggestion plugin (`onKeyDown`); this
 * component is a pure presentation shell.
 */
export function WikilinkPopup(props: WikilinkPopupProps): JSX.Element | null {
  const { items, selectedIndex, query, position, onSelect, onHover } = props;
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active item into view whenever selection moves.
  useEffect(() => {
    const root = listRef.current;
    if (root === null) return;
    const active = root.querySelector<HTMLElement>(`[data-index="${String(selectedIndex)}"]`);
    if (active === null) return;
    active.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Decide whether to flip the popup above the cursor. We don't have a
  // measured height before mount, so use a rough estimate; Tippy/Popper
  // would be overkill here.
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
  if (items.length === 0 && query.trim().length === 0) return null;

  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="Suggerimenti wikilink"
      className="fixed z-50 max-h-60 w-72 overflow-y-auto rounded-md border border-border bg-bg shadow-lg"
      style={{ top: placement.top, left: placement.left }}
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-fg-muted">Nessun risultato per «{query}»</div>
      ) : (
        items.slice(0, MAX_VISIBLE).map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.path ?? `__create__${item.title}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-index={idx}
              onMouseDown={(e): void => {
                // Prevent the editor from losing focus before our click
                // handler runs — otherwise the suggestion plugin tears
                // down on blur and the click never registers a selection.
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={(): void => onHover(idx)}
              className={[
                'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
                isSelected ? 'bg-accent/10 text-fg' : 'bg-transparent text-fg hover:bg-bg-subtle',
              ].join(' ')}
            >
              <span className="truncate">
                {item.isCreate ? (
                  <>
                    <span className="text-fg-muted">Crea </span>
                    <span className="font-medium">«{item.title}»</span>
                  </>
                ) : (
                  <HighlightedTitle title={item.title} query={query} />
                )}
              </span>
              {!item.isCreate && item.path !== null && (
                <span className="ml-2 shrink-0 truncate text-xs text-fg-muted">{item.path}</span>
              )}
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}

/**
 * Highlights the substring of the title that matches the query. Falls
 * back to the unmodified title when the query is empty or the substring
 * isn't found (e.g. when the search backend matches on tokens we don't
 * have here).
 */
function HighlightedTitle(props: { title: string; query: string }): JSX.Element {
  const { title, query } = props;
  const trimmed = query.trim();
  if (trimmed.length === 0) return <>{title}</>;
  const lower = title.toLowerCase();
  const idx = lower.indexOf(trimmed.toLowerCase());
  if (idx === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, idx)}
      <span className="font-semibold text-accent">{title.slice(idx, idx + trimmed.length)}</span>
      {title.slice(idx + trimmed.length)}
    </>
  );
}
