import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Where the panel sits relative to its anchor. Only the four "start"/"end"
 * variants the app actually uses are exposed; the flip logic derives the
 * opposite side automatically when the preferred side would overflow.
 */
export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end'
  // Side placements put the panel beside the anchor (used by submenus):
  // the panel sits to the right (start) with its top aligned, flipping to
  // the left when it would overflow the viewport.
  | 'right-start'
  | 'left-start';

/**
 * The anchor a popover positions against. Either an element (the common
 * trigger-button case) or a fixed viewport point — the latter is what
 * cursor-opened context menus need (they have no DOM trigger to measure).
 */
export type PopoverAnchor =
  | { kind: 'element'; ref: RefObject<HTMLElement | null> }
  | { kind: 'point'; x: number; y: number };

export type PopoverProps = {
  open: boolean;
  onClose: () => void;
  anchor: PopoverAnchor;
  children: ReactNode;
  placement?: PopoverPlacement;
  /** Gap in px between anchor edge and panel (ignored for point anchors). */
  offset?: number;
  /** Reposition on window scroll/resize while open. Default true. */
  repositionOnScroll?: boolean;
  /**
   * Element to return focus to when the popover closes. For element anchors
   * this defaults to the anchor element; pass explicitly for point anchors
   * (e.g. the row that was right-clicked) or omit to skip focus return.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible label for the panel region. */
  ariaLabel?: string;
  /** Forwarded to the panel so callers can wire roles (e.g. `menu`). */
  role?: string;
  className?: string;
  /** Extra inline style merged after positioning (z-index overrides etc.). */
  style?: CSSProperties;
  /**
   * Move focus into the panel on open. Menus manage their own roving focus,
   * so they opt out and focus the first item themselves. Default true.
   */
  autoFocus?: boolean;
  /** Min viewport margin the panel is clamped to. Default 6px. */
  viewportPadding?: number;
  /**
   * Restore focus to the trigger (or `returnFocusRef`) on close. Nested
   * popovers (submenus) opt out so they don't fight the root for focus.
   * Default true.
   */
  restoreFocus?: boolean;
  /** Ref to the rendered panel element, for callers needing measurements. */
  panelRef?: RefObject<HTMLDivElement | null>;
};

const DEFAULT_VIEWPORT_PADDING = 6;
const DEFAULT_OFFSET = 4;

type Coords = { left: number; top: number };

/**
 * Anchored overlay primitive. Owns positioning, viewport flip + clamp,
 * outside-click / Escape dismissal, and focus return to the trigger.
 * Renders in a portal at `document.body` with `position: fixed` so it
 * escapes overflow/transform ancestors. Token-based and
 * `prefers-reduced-motion` aware (the fade is dropped under reduce).
 *
 * Positioning is measured after layout: we read the panel's real size and
 * the anchor rect, pick the preferred placement, flip to the opposite side
 * if it would overflow the viewport, then clamp the result inside the
 * viewport padding. This replaces the per-component hand-rolled flip logic.
 */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  placement = 'bottom-start',
  offset = DEFAULT_OFFSET,
  repositionOnScroll = true,
  returnFocusRef,
  ariaLabel,
  role,
  className,
  style,
  autoFocus = true,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
  restoreFocus = true,
  panelRef,
}: PopoverProps): JSX.Element | null {
  const internalPanelRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();
  const [coords, setCoords] = useState<Coords | null>(null);

  const setPanelNode = useCallback(
    (node: HTMLDivElement | null): void => {
      internalPanelRef.current = node;
      // panelRef is an optional out-param; assigning through the ref object
      // is intentional (it's a mutable ref the caller created).
      if (panelRef !== undefined) {
        (panelRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [panelRef],
  );

  // Capture the element that had focus when the popover opened so we can
  // restore it on close (WAI-ARIA: focus returns to the trigger). For
  // element anchors we fall back to the anchor itself.
  const focusBeforeOpenRef = useRef<HTMLElement | null>(null);

  // Resolve the anchor into a rect-like the positioner can measure. Point
  // anchors collapse to a zero-size rect at the cursor.
  const measureAnchor = useCallback((): DOMRect => {
    if (anchor.kind === 'element') {
      const el = anchor.ref.current;
      if (el !== null) return el.getBoundingClientRect();
      return new DOMRect(0, 0, 0, 0);
    }
    return new DOMRect(anchor.x, anchor.y, 0, 0);
  }, [anchor]);

  const reposition = useCallback((): void => {
    const panel = internalPanelRef.current;
    if (panel === null) return;
    const anchorRect = measureAnchor();
    const panelRect = panel.getBoundingClientRect();
    const next = computePosition({
      anchorRect,
      panelWidth: panelRect.width,
      panelHeight: panelRect.height,
      placement,
      offset: anchor.kind === 'point' ? 0 : offset,
      viewportPadding,
    });
    setCoords((prev) =>
      prev !== null && prev.left === next.left && prev.top === next.top ? prev : next,
    );
  }, [anchor.kind, measureAnchor, offset, placement, viewportPadding]);

  // Position synchronously after the panel mounts/updates so it never
  // paints a frame at the wrong spot. Re-runs when the anchor point moves.
  const pointKey = anchor.kind === 'point' ? `${anchor.x},${anchor.y}` : 'element';
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition, pointKey, children]);

  // Outside-click (mousedown so we close before the next click lands) and
  // Escape dismissal. Mirrors the pattern the migrated components had.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      const panel = internalPanelRef.current;
      if (panel === null) return;
      if (!(e.target instanceof Node)) return;
      // Clicks on the element anchor are not "outside" — let the trigger
      // toggle handle them so we don't close-then-reopen.
      if (anchor.kind === 'element') {
        const el = anchor.ref.current;
        if (el !== null && el.contains(e.target)) return;
      }
      if (!panel.contains(e.target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return (): void => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchor]);

  // Reposition on scroll/resize so the panel tracks its anchor.
  useEffect(() => {
    if (!open || !repositionOnScroll) return;
    const onScrollOrResize = (): void => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return (): void => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, repositionOnScroll, reposition]);

  // Focus management: remember the prior focus on open, move focus into the
  // panel (unless the caller manages its own), and restore on close.
  useEffect(() => {
    if (!open) return;
    if (restoreFocus) {
      focusBeforeOpenRef.current =
        returnFocusRef?.current ??
        (anchor.kind === 'element' ? anchor.ref.current : null) ??
        (document.activeElement as HTMLElement | null);
    }
    if (autoFocus) {
      // Defer so the panel is in the DOM and positioned first.
      const id = window.requestAnimationFrame(() => {
        internalPanelRef.current?.focus();
      });
      return (): void => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [open, autoFocus, anchor, returnFocusRef, restoreFocus]);

  useEffect(() => {
    // On unmount/close, return focus to where it was. Guard against
    // returning focus to a detached node (e.g. a deleted tree row).
    return (): void => {
      if (!restoreFocus) return;
      const target = focusBeforeOpenRef.current;
      if (target !== null && document.contains(target)) {
        target.focus();
      }
    };
  }, [open, restoreFocus]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={setPanelNode}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel === undefined ? undefined : labelId}
      tabIndex={autoFocus ? -1 : undefined}
      style={{
        position: 'fixed',
        left: coords?.left ?? 0,
        top: coords?.top ?? 0,
        // Hide the first paint until measured to avoid a flash at (0,0).
        visibility: coords === null ? 'hidden' : 'visible',
        ...style,
      }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}

function computePosition({
  anchorRect,
  panelWidth,
  panelHeight,
  placement,
  offset,
  viewportPadding,
}: {
  anchorRect: DOMRect;
  panelWidth: number;
  panelHeight: number;
  placement: PopoverPlacement;
  offset: number;
  viewportPadding: number;
}): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Side placements (submenus): panel sits beside the anchor, top edges
  // aligned, flipping horizontally when the preferred side overflows.
  if (placement === 'right-start' || placement === 'left-start') {
    const rightLeft = anchorRect.right + offset;
    const leftLeft = anchorRect.left - panelWidth - offset;
    const preferRight = placement === 'right-start';
    const rightFits = rightLeft + panelWidth <= vw - viewportPadding;
    const leftFits = leftLeft >= viewportPadding;
    let sideLeft: number;
    if (preferRight) {
      sideLeft = rightFits || !leftFits ? rightLeft : leftLeft;
    } else {
      sideLeft = leftFits || !rightFits ? leftLeft : rightLeft;
    }
    const sideTop = anchorRect.top;
    const maxSideLeft = Math.max(viewportPadding, vw - panelWidth - viewportPadding);
    const maxSideTop = Math.max(viewportPadding, vh - panelHeight - viewportPadding);
    return {
      left: Math.min(Math.max(sideLeft, viewportPadding), maxSideLeft),
      top: Math.min(Math.max(sideTop, viewportPadding), maxSideTop),
    };
  }

  const isBottom = placement.startsWith('bottom');
  const isStart = placement.endsWith('start');

  // Vertical axis: place below (bottom) or above (top) the anchor, then
  // flip if the preferred side would overflow and the opposite side fits
  // better.
  const belowTop = anchorRect.bottom + offset;
  const aboveTop = anchorRect.top - offset - panelHeight;
  let top: number;
  if (isBottom) {
    const overflowsBottom = belowTop + panelHeight > vh - viewportPadding;
    const fitsAbove = aboveTop >= viewportPadding;
    top = overflowsBottom && fitsAbove ? aboveTop : belowTop;
  } else {
    const overflowsTop = aboveTop < viewportPadding;
    const fitsBelow = belowTop + panelHeight <= vh - viewportPadding;
    top = overflowsTop && fitsBelow ? belowTop : aboveTop;
  }

  // Horizontal axis: align the panel's start edge to the anchor's left
  // (start) or its end edge to the anchor's right (end), flipping if the
  // aligned side would overflow.
  const startLeft = anchorRect.left;
  const endLeft = anchorRect.right - panelWidth;
  let left: number;
  if (isStart) {
    const overflowsRight = startLeft + panelWidth > vw - viewportPadding;
    left = overflowsRight ? endLeft : startLeft;
  } else {
    const overflowsLeft = endLeft < viewportPadding;
    left = overflowsLeft ? startLeft : endLeft;
  }

  // Final clamp so the panel always stays fully inside the viewport.
  const maxLeft = Math.max(viewportPadding, vw - panelWidth - viewportPadding);
  const maxTop = Math.max(viewportPadding, vh - panelHeight - viewportPadding);
  return {
    left: Math.min(Math.max(left, viewportPadding), maxLeft),
    top: Math.min(Math.max(top, viewportPadding), maxTop),
  };
}
