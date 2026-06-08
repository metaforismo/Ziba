import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TooltipProps = {
  /** Visible label. Kept short — this is an affordance hint, not prose. */
  label: string;
  /**
   * The single interactive child the tooltip describes. We clone it to
   * attach hover/focus handlers and `aria-describedby` so the hint is
   * announced by screen readers without duplicating the button markup.
   */
  children: ReactElement;
  placement?: TooltipPlacement;
  /** Hover/focus open delay in ms (focus shows instantly for keyboard users). */
  delayMs?: number;
};

// Position the bubble relative to the wrapper. Translate keeps it centred
// on the trigger's axis; the gap is a small offset so it doesn't touch.
const PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
};

/**
 * Lightweight, token-based tooltip. Wraps a single interactive element and
 * shows a themed bubble on hover/focus. Accessible (`role="tooltip"` +
 * `aria-describedby`), respects `prefers-reduced-motion` (the fade is
 * disabled via `motion-reduce`), and shows instantly on keyboard focus so
 * tab users aren't penalised by the hover delay.
 */
export function Tooltip({
  label,
  children,
  placement = 'top',
  delayMs = 400,
}: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback((): void => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(true), delayMs);
  }, [clearTimer, delayMs]);

  const close = useCallback((): void => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  // Clear any pending open timer on unmount so the delayed setOpen never
  // fires on an unmounted component (e.g. a tab/ribbon button removed while
  // hovered mid-delay).
  useEffect(() => clearTimer, [clearTimer]);

  // Preserve any handlers already on the child so wrapping a button that
  // also wants its own onMouseEnter/onFocus keeps working.
  const childProps = children.props as {
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
    'aria-describedby'?: string;
  };

  const describedBy = [childProps['aria-describedby'], tooltipId].filter(Boolean).join(' ');

  const trigger = cloneElement(children, {
    'aria-describedby': describedBy,
    onMouseEnter: (e: MouseEvent): void => {
      childProps.onMouseEnter?.(e);
      scheduleOpen();
    },
    onMouseLeave: (e: MouseEvent): void => {
      childProps.onMouseLeave?.(e);
      close();
    },
    // Keyboard focus shows the hint immediately — no delay for tab users.
    onFocus: (e: FocusEvent): void => {
      childProps.onFocus?.(e);
      clearTimer();
      setOpen(true);
    },
    onBlur: (e: FocusEvent): void => {
      childProps.onBlur?.(e);
      close();
    },
    // WAI-ARIA tooltip requirement: Escape dismisses the tooltip while
    // keeping focus on the trigger (we don't blur, so the user stays put).
    onKeyDown: (e: KeyboardEvent): void => {
      childProps.onKeyDown?.(e);
      if (e.key === 'Escape' && open) {
        close();
      }
    },
  } as Partial<typeof childProps>);

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        role="tooltip"
        id={tooltipId}
        aria-hidden={!open}
        className={[
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-xs font-medium text-fg shadow-md transition-opacity duration-100 motion-reduce:transition-none',
          PLACEMENT_CLASS[placement],
          open ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      >
        {label}
      </span>
    </span>
  );
}
