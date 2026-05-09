import clsx from 'clsx';
import { useRef, type DragEvent, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import type { DatabaseRow, DetectedProperty } from '../../../../shared/ipc';

type Props = {
  row: DatabaseRow;
  /** Source column id — needed by the drop handler so it can compute the patch. */
  columnId: string;
  /** The active groupBy property key, omitted from secondary chips on the card. */
  groupBy: string;
  /**
   * Optional secondary property to surface under the title. Picked at the
   * board level (densest non-groupBy property) so every card uses the
   * same key for visual consistency.
   */
  secondaryKey: string | null;
  /** True while this card is the drag source — used to dim it. */
  dragging: boolean;
  /** Show a subtle "saving" indicator over the card while the IPC is in-flight. */
  saving: boolean;
  /** Click without drag → open the note. */
  onOpen(path: string): void;
  /** Drag start with the row+source-column pair encoded in dataTransfer. */
  onDragStart(row: DatabaseRow, columnId: string): void;
  onDragEnd(): void;
};

/** Italian-locale formatters reused from the table view's vocabulary. */
const DATE_FORMATTER = new Intl.DateTimeFormat('it', { dateStyle: 'medium' });
const NUMBER_FORMATTER = new Intl.NumberFormat('it');

/**
 * Card uses HTML5 drag-and-drop API directly (no `dnd-kit` / `react-dnd`)
 * so the bundle stays lean. The pointer-down handler captures the start
 * position so the click handler can suppress accidental navigations
 * while the user was actually dragging the card.
 */
const DRAG_THRESHOLD_PX = 5;

/**
 * Renders a single tag chip. Mirrors the Table's chip styling so
 * users see the same visual language across views.
 */
function Chip({ label }: { label: string }): JSX.Element {
  return (
    <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[11px] text-fg-subtle">{label}</span>
  );
}

/** Render the secondary property under the title, branching on type. */
function SecondaryValue({ prop }: { prop: DetectedProperty }): JSX.Element | null {
  switch (prop.type) {
    case 'text':
    case 'url':
      return <span className="truncate text-xs text-fg-muted">{prop.value}</span>;
    case 'number':
      return (
        <span className="text-xs tabular-nums text-fg-muted">
          {NUMBER_FORMATTER.format(prop.value)}
        </span>
      );
    case 'boolean':
      return (
        <span className="text-xs text-fg-muted" aria-label={prop.value ? 'vero' : 'falso'}>
          {prop.value ? '✓' : '✗'}
        </span>
      );
    case 'date': {
      const d = new Date(`${prop.value}T00:00:00Z`);
      const label = Number.isNaN(d.getTime()) ? prop.value : DATE_FORMATTER.format(d);
      return <span className="text-xs text-fg-muted">{label}</span>;
    }
    case 'string-array': {
      if (prop.value.length === 0) return null;
      return (
        <span className="flex flex-wrap gap-1">
          {prop.value.map((v, i) => (
            <Chip key={`${v}-${i}`} label={v} />
          ))}
        </span>
      );
    }
    default:
      return null;
  }
}

export function Card({
  row,
  columnId,
  groupBy,
  secondaryKey,
  dragging,
  saving,
  onOpen,
  onDragStart,
  onDragEnd,
}: Props): JSX.Element {
  // Track the pointer-down position so a tiny drag-and-release isn't
  // mistaken for a click (and vice-versa). Stored in a ref because we
  // don't want re-renders on pointer move.
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const start = startRef.current;
    if (start === null) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      movedRef.current = true;
    }
  };

  const handleClick = (): void => {
    // If the pointer moved more than the threshold, treat it as a drag
    // gesture instead and DON'T navigate. The browser still fires a
    // click event on drag-end in some configs, so we guard explicitly.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onOpen(row.path);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(row.path);
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>): void => {
    // dataTransfer requires SOMETHING for the drag to take in some
    // browsers (Firefox in particular). Encode our pair as JSON so a
    // future drop into a non-board target sees the schema. We also
    // notify the parent for in-renderer state.
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-ziba-card', JSON.stringify({ path: row.path, columnId }));
    // Plain text fallback — never read by us, but lets a curious user
    // drop the card into a text field and see the path.
    e.dataTransfer.setData('text/plain', row.path);
    onDragStart(row, columnId);
  };

  const secondaryProp = secondaryKey !== null ? row.properties[secondaryKey] : undefined;
  // Always include the groupBy chips for string-array (Notion-style
  // visual: a card in the "urgent" column also shows the other tags).
  const groupProp = row.properties[groupBy];
  const groupChips =
    groupProp !== undefined && groupProp.type === 'string-array' ? groupProp.value : null;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-grabbed={dragging}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={row.path}
      className={clsx(
        'group flex w-full cursor-grab flex-col gap-1.5 rounded border border-border bg-bg p-2.5 text-left shadow-sm transition-opacity',
        'hover:border-accent/50 hover:bg-bg-subtle focus:outline-none focus:ring-1 focus:ring-accent',
        'active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-fg">{row.title}</span>
        {saving && (
          <span aria-live="polite" className="shrink-0 text-[10px] text-fg-muted">
            Salvataggio…
          </span>
        )}
      </div>

      {secondaryKey !== null && secondaryProp !== undefined && (
        <div className="flex items-baseline gap-1 text-[11px] text-fg-muted">
          <span className="shrink-0 uppercase tracking-wide">{secondaryKey}:</span>
          <SecondaryValue prop={secondaryProp} />
        </div>
      )}

      {/* When groupBy is multi-select, show the full tag set so the user
          sees that this card lives in multiple columns at once. */}
      {groupChips !== null && groupChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {groupChips.map((v, i) => (
            <Chip key={`${v}-${i}`} label={v} />
          ))}
        </div>
      )}
    </div>
  );
}
