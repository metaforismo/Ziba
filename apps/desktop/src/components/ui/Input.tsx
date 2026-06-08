import clsx from 'clsx';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /**
   * Visible label rendered above the field and wired to it via `htmlFor`.
   * Omit it for inline/standalone inputs and pass `aria-label` instead.
   */
  label?: ReactNode;
  /**
   * Marks the field as invalid (sets `aria-invalid` + a red border). The
   * caller still renders its own error message — this only carries the state.
   */
  invalid?: boolean;
  /** Decorative glyph inside the field, leading edge. */
  leadingIcon?: ReactNode;
  /** Extra classes on the outer wrapper (the label + field group). */
  wrapperClassName?: string;
};

// Mirrors the prompt/rename input language (subtle bordered field, accent on
// focus) so adoption is visually identical, plus a focus-visible ring that
// matches the other primitives. `invalid` swaps the border to red.
const FIELD =
  'w-full rounded border bg-bg-subtle px-2 py-1.5 text-sm text-fg placeholder:text-fg-muted outline-none transition focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';

/**
 * Token-based text input. A real `<input>` (forwards its ref, defaults
 * `type="text"`) with consistent focus styling, an `invalid` state
 * (`aria-invalid` + red border), an optional leading icon, and an optional
 * visible label that auto-wires `htmlFor`/`id`. Minimal and composable:
 * the caller owns value/onChange and any surrounding error copy.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, invalid = false, leadingIcon, wrapperClassName, className, id, type, ...rest },
  ref,
): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? (label !== undefined ? generatedId : undefined);

  const field = (
    <input
      {...rest}
      ref={ref}
      id={inputId}
      type={type ?? 'text'}
      aria-invalid={invalid || undefined}
      className={clsx(
        FIELD,
        invalid ? 'border-red-500 focus:border-red-500' : 'border-border',
        // Pad past the inline icon so the caret never overlaps it.
        leadingIcon !== undefined && 'pl-8',
        className,
      )}
    />
  );

  if (label === undefined && leadingIcon === undefined) {
    // Bare field — no wrapper so it drops in exactly where a raw <input> was.
    return field;
  }

  return (
    <div className={clsx('flex flex-col gap-1', wrapperClassName)}>
      {label !== undefined && (
        <label htmlFor={inputId} className="text-xs font-medium text-fg-subtle">
          {label}
        </label>
      )}
      {leadingIcon !== undefined ? (
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-2 inline-flex items-center text-fg-muted"
          >
            {leadingIcon}
          </span>
          {field}
        </div>
      ) : (
        field
      )}
    </div>
  );
});
