import type { JSX } from 'react';
import { kindToHsl } from '../../lib/kind-color';

type Props = {
  /** Types currently visible / active in the graph (chips selected → just the one). */
  visibleTypes: ReadonlyArray<{ id: string; label: string; color: string | null }>;
  /** Active relation kinds. Empty array → legend omits the kinds section. */
  visibleKinds: ReadonlyArray<string>;
};

/**
 * Top-right floating panel that maps colors to types + relation kinds.
 * Hidden entirely when there's nothing to legend (no types AND no
 * kinds visible).
 */
export function Legend({ visibleTypes, visibleKinds }: Props): JSX.Element | null {
  if (visibleTypes.length === 0 && visibleKinds.length === 0) return null;
  return (
    <div
      aria-label="Legenda"
      className="pointer-events-none absolute right-2 top-2 z-10 max-w-[200px] rounded-md border border-border bg-bg-subtle/95 p-2 text-xs text-fg shadow"
    >
      {visibleTypes.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Tipi
          </p>
          <ul className="flex flex-col gap-0.5">
            {visibleTypes.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: t.color ?? 'rgb(99, 102, 241)' }}
                />
                <span className="truncate">{t.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {visibleKinds.length > 0 && (
        <div className={visibleTypes.length > 0 ? 'mt-2' : ''}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
            Relazioni
          </p>
          <ul className="flex flex-col gap-0.5">
            {visibleKinds.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: kindToHsl(k) }}
                />
                <span className="truncate">{k}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
