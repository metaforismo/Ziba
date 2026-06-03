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
  if (variant === 'graph') {
    return 'inline-flex h-9 items-center overflow-hidden rounded-lg border border-[#3a3a3f] bg-[#242426]/86 shadow-lg shadow-black/20 backdrop-blur';
  }
  return 'inline-flex min-w-0 items-center gap-0.5 rounded-md border border-border bg-bg px-0.5 py-0.5';
}

function itemClass(variant: SegmentedVariant): string {
  if (variant === 'graph') {
    return 'inline-flex h-full items-center gap-1 px-3 text-[12px] font-medium text-[#a9a9af] transition hover:bg-white/8 hover:text-[#f4f4f5]';
  }
  return 'inline-flex min-w-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-fg-muted transition hover:bg-bg-muted hover:text-fg';
}

function activeItemClass(variant: SegmentedVariant): string {
  if (variant === 'graph') return 'bg-white/10 text-[#f4f4f5]';
  return 'bg-bg-muted text-fg';
}
