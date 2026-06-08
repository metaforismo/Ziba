import type { JSX, ReactNode } from 'react';

/**
 * A single call-to-action wired to a real store method. `loading` mirrors
 * an in-flight async action so the button can disable + relabel without
 * the caller threading its own spinner state.
 */
export type EmptyViewAction = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  /** Accessible label override when `label` alone is ambiguous out of context. */
  ariaLabel?: string;
};

export type EmptyViewProps = {
  /**
   * Phosphor icon (or any node). Rendered inside a token-themed badge and
   * marked `aria-hidden` — the heading carries the accessible meaning.
   */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyViewAction;
  secondaryAction?: EmptyViewAction;
  /**
   * Compact density for narrow side panels (outline, references). Smaller
   * badge, tighter spacing, left-aligned text so it reads as an inline
   * panel note rather than a full-pane hero.
   */
  compact?: boolean;
  /**
   * Visual tone. `danger` is reserved for error-shaped empties (e.g. a
   * failed graph load) so they read distinctly from a friendly "nothing
   * here yet" state.
   */
  tone?: 'neutral' | 'danger';
  /** Extra classes on the outer wrapper (e.g. background override). */
  className?: string;
};

function actionClasses(variant: 'primary' | 'secondary', compact: boolean): string {
  // Mirrors EmptyEditor's button language: accent-filled primary, subtle
  // bordered secondary, with the same focus-visible + reduced-motion guards.
  const size = compact ? 'min-h-9 px-3 text-xs' : 'min-h-11 px-5 text-sm';
  const base =
    'group inline-flex w-full items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0';
  const skin =
    variant === 'primary'
      ? 'bg-accent text-accent-fg hover:opacity-95'
      : 'border border-border bg-bg-subtle text-fg hover:bg-bg-muted';
  return `${base} ${size} ${skin}`;
}

function ActionButton({
  action,
  variant,
  compact,
}: {
  action: EmptyViewAction;
  variant: 'primary' | 'secondary';
  compact: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.loading === true}
      aria-busy={action.loading === true}
      aria-label={action.ariaLabel}
      className={actionClasses(variant, compact)}
    >
      {action.label}
    </button>
  );
}

/**
 * Prop-driven empty/placeholder shared across every main surface (graph,
 * database, search, side panels). Token-based and theme-aware so it reads
 * correctly in all five themes plus light/dark; the entrance animation is
 * disabled under `prefers-reduced-motion` via the shared stagger class.
 *
 * Accessibility: the wrapper is a labelled `group` region so screen
 * readers announce it as a discrete block; the icon is decorative.
 */
export function EmptyView({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  tone = 'neutral',
  className,
}: EmptyViewProps): JSX.Element {
  const isDanger = tone === 'danger';

  const wrapper = [
    'ziba-empty-editor-stagger flex h-full w-full flex-col motion-reduce:[&_*]:animate-none',
    compact
      ? 'items-start justify-start gap-2 px-3 py-6 text-left'
      : 'items-center justify-center gap-1 px-6 py-10 text-center',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const badge = [
    'flex items-center justify-center rounded-2xl border shadow-sm',
    compact ? 'size-10' : 'size-16',
    isDanger
      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
      : 'border-border bg-bg-subtle text-accent',
  ].join(' ');

  return (
    <section role="group" aria-label={title} className={wrapper}>
      {icon !== undefined && (
        <span aria-hidden="true" className={badge}>
          {icon}
        </span>
      )}

      <h2
        className={[
          compact ? 'mt-2 text-sm' : 'mt-5 text-lg',
          'font-semibold tracking-tight',
          isDanger ? 'text-red-600 dark:text-red-400' : 'text-fg',
        ].join(' ')}
      >
        {title}
      </h2>

      {description !== undefined && (
        <p
          className={[
            compact ? 'mt-1 text-xs leading-5' : 'mt-2 max-w-[42ch] text-sm leading-6',
            'text-fg-subtle',
          ].join(' ')}
        >
          {description}
        </p>
      )}

      {(action !== undefined || secondaryAction !== undefined) && (
        <div
          className={[
            'flex flex-col gap-2',
            compact ? 'mt-3 w-full' : 'mt-6 w-full max-w-[260px]',
          ].join(' ')}
        >
          {action !== undefined && (
            <ActionButton action={action} variant="primary" compact={compact} />
          )}
          {secondaryAction !== undefined && (
            <ActionButton action={secondaryAction} variant="secondary" compact={compact} />
          )}
        </div>
      )}
    </section>
  );
}
