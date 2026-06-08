import clsx from 'clsx';
import type { ReactNode } from 'react';

type SegmentedVariant = 'panel' | 'graph';

export type SegmentedControlItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

export type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  value: T;
  items: readonly SegmentedControlItem<T>[];
  onChange(value: T): void;
  variant?: SegmentedVariant;
  className?: string;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  items,
  onChange,
  variant = 'panel',
  className,
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div role="tablist" aria-label={ariaLabel} className={clsx(containerClass(variant), className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            onClick={(): void => onChange(item.id)}
            className={clsx(itemClass(variant), active && activeItemClass(variant))}
          >
            {item.icon !== undefined && <span aria-hidden="true">{item.icon}</span>}
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function containerClass(variant: SegmentedVariant): string {
  // Graph variant lives on the themed floating chrome — token-based so it
  // follows every theme instead of the old dark-only hex.
  if (variant === 'graph') {
    return 'inline-flex h-9 items-center overflow-hidden rounded-lg border border-graph-edge bg-graph-surface/86 shadow-lg shadow-black/20 backdrop-blur';
  }
  return 'inline-flex min-w-0 items-center gap-0.5 rounded-md border border-border bg-bg px-0.5 py-0.5';
}

function itemClass(variant: SegmentedVariant): string {
  if (variant === 'graph') {
    return 'inline-flex h-full items-center gap-1 px-3 text-[12px] font-medium text-graph-text-muted transition hover:bg-graph-hover hover:text-graph-text focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-graph-selection';
  }
  return 'inline-flex min-w-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-fg-muted transition hover:bg-bg-muted hover:text-fg';
}

function activeItemClass(variant: SegmentedVariant): string {
  if (variant === 'graph') return 'bg-graph-hover text-graph-text';
  return 'bg-bg-muted text-fg';
}
