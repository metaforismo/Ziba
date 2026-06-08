import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * In-flight async action: disables the button (clicks are suppressed),
   * sets `aria-busy`, and swaps any leading icon for a spinner. The visible
   * label stays put so the accessible name doesn't change mid-action.
   */
  loading?: boolean;
  /** Stretches to the container width (e.g. stacked dialog/empty-state actions). */
  fullWidth?: boolean;
  /** Decorative glyph before the label. Hidden while `loading` (spinner wins). */
  leadingIcon?: ReactNode;
  /** Decorative glyph after the label. Hidden while `loading`. */
  trailingIcon?: ReactNode;
};

// Shared chrome. `min-h-*` (per size) guarantees a comfortable target; the
// focus-visible ring matches the other primitives (accent outline, offset 1)
// and `motion-reduce` drops the colour/opacity transition for users who opt
// out of motion. Disabled + loading both route through `:disabled` so the
// cursor + dimming are consistent.
const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

const SIZE_CLASS: Record<ButtonSize, string> = {
  // `md` mirrors the existing dialog buttons exactly (rounded px-3 py-1.5
  // text-sm) so adopting it is pixel-identical.
  md: 'min-h-9 px-3 py-1.5 text-sm',
  sm: 'min-h-7 px-2 py-1 text-xs',
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // accent fill — matches the dialog OK / confirm button.
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  // subtle bordered surface — matches the EmptyView secondary action.
  secondary: 'border border-border bg-bg-subtle text-fg hover:bg-bg-muted',
  // transparent until hover — matches the dialog Cancel button.
  ghost: 'text-fg-subtle hover:bg-bg-muted hover:text-fg',
  // destructive — matches the ConfirmDialog destructive confirm button.
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

/**
 * Shared button primitive. A real `<button>` (forwards its ref, defaults
 * `type="button"` so it never accidentally submits a form) with token-based
 * variants/sizes, a `loading` state that mirrors an in-flight async action
 * (aria-busy + spinner), and optional leading/trailing icons.
 *
 * Token-only and theme-aware so every variant reads on all five themes; the
 * focus ring + reduced-motion guard match the other `ui/` primitives.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    type,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
): JSX.Element {
  // Loading implies disabled so the action can't fire twice while in flight.
  const isDisabled = disabled === true || loading;

  return (
    <button
      {...rest}
      ref={ref}
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        BASE,
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner /> : leadingIcon !== undefined && <Glyph>{leadingIcon}</Glyph>}
      {children}
      {!loading && trailingIcon !== undefined && <Glyph>{trailingIcon}</Glyph>}
    </button>
  );
});

function Glyph({ children }: { children: ReactNode }): JSX.Element {
  // Icons are decorative — the label carries the accessible name.
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      {children}
    </span>
  );
}

function Spinner(): JSX.Element {
  // `currentColor` so the spinner inherits each variant's text colour; the
  // spin is dropped under prefers-reduced-motion (it just shows a static ring).
  return (
    <svg
      data-testid="ziba-button-spinner"
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
      fill="none"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
