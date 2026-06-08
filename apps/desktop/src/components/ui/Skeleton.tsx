import type { JSX } from 'react';

export type SkeletonProps = {
  className?: string;
};

/**
 * Token-based shimmer block. Uses `bg-bg-muted` so it reads as an inert
 * placeholder in every theme, and pulses via Tailwind's `animate-pulse`
 * which is automatically suppressed under `prefers-reduced-motion` by the
 * `motion-reduce` guard.
 */
export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={[
        'block rounded bg-bg-muted animate-pulse motion-reduce:animate-none',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

/**
 * A few skeleton rows for list-shaped surfaces (database table, panels).
 * Widths vary so the placeholder doesn't read as a flat grid. Carries an
 * `aria-busy` status region so assistive tech announces "loading" without
 * a visual spinner.
 */
export function SkeletonRows({
  rows = 6,
  label,
  className,
}: {
  rows?: number;
  /** Accessible status text, e.g. "Caricamento note…". */
  label: string;
  className?: string;
}): JSX.Element {
  // Deterministic width pattern keeps the placeholder stable across
  // re-renders (no per-render Math.random reflow) while still varied.
  const widths = ['w-[82%]', 'w-[68%]', 'w-[90%]', 'w-[55%]', 'w-[74%]', 'w-[63%]'];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={['flex flex-col gap-3', className ?? ''].filter(Boolean).join(' ')}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <Skeleton className={`h-3.5 ${widths[i % widths.length]}`} />
        </div>
      ))}
    </div>
  );
}
