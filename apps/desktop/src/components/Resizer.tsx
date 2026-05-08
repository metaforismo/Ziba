import { useCallback, useEffect, useRef } from 'react';

type ResizerProps = {
  /** Current width of the pane the resizer is attached to. */
  width: number;
  /** New width committed during/at the end of a drag. */
  onWidthChange: (next: number) => void;
  /**
   * 'left' = resizer sits on the right edge of a left pane (drag right
   *          increases width).
   * 'right' = resizer sits on the left edge of a right pane (drag right
   *           decreases width).
   */
  side: 'left' | 'right';
  ariaLabel: string;
};

/**
 * 4px-wide drag handle. Uses pointer capture so we keep getting events
 * even if the cursor leaves the element while dragging.
 */
export function Resizer({ width, onWidthChange, side, ariaLabel }: ResizerProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el === null) return;
      el.setPointerCapture(e.pointerId);
      dragState.current = { startX: e.clientX, startWidth: width };
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = dragState.current;
      if (state === null) return;
      const delta = e.clientX - state.startX;
      const next = side === 'left' ? state.startWidth + delta : state.startWidth - delta;
      onWidthChange(next);
    },
    [onWidthChange, side],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el !== null && el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      dragState.current = null;
    },
    [],
  );

  // Reset cursor-disrupting drag state if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      dragState.current = null;
    };
  }, []);

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="w-1 cursor-col-resize bg-border/0 hover:bg-border transition-colors"
    />
  );
}
