import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonVariant = 'panel' | 'graph';

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  pressed?: boolean;
};

const BASE =
  'inline-flex shrink-0 items-center justify-center transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  panel:
    'h-7 w-7 rounded border border-border bg-bg-subtle text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:outline-accent',
  // Graph toolbar buttons live on the themed floating chrome — token-based
  // so they read on every theme instead of the old dark-only hex.
  graph:
    'h-9 w-9 text-graph-text-muted hover:bg-graph-hover hover:text-graph-text focus-visible:outline-graph-selection',
};

export function IconButton({
  label,
  icon,
  variant = 'panel',
  pressed,
  className,
  title,
  ...buttonProps
}: IconButtonProps): JSX.Element {
  return (
    <button
      {...buttonProps}
      type={buttonProps.type ?? 'button'}
      aria-label={label}
      title={title ?? label}
      {...(pressed !== undefined && { 'aria-pressed': pressed })}
      className={clsx(BASE, VARIANT_CLASS[variant], pressed && pressedClass(variant), className)}
    >
      {icon}
    </button>
  );
}

function pressedClass(variant: IconButtonVariant): string {
  if (variant === 'graph') return 'bg-graph-hover text-graph-text';
  return 'bg-bg-muted text-fg';
}
