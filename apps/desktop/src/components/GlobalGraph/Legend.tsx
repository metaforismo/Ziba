import type { JSX } from 'react';
import { kindToHsl } from '../../lib/kind-color';

export type LegendGroup = { id: string; label: string; color: string };

type Props = {
  /**
   * Active user-defined graph groups (query → color). The ONLY source of
   * node color in the monochrome redesign. Empty → the groups section is
   * omitted.
   */
  groups: ReadonlyArray<LegendGroup>;
  /** When true, the legend shows the gray "unresolved" phantom-node entry. */
  hasUnresolved: boolean;
  /** Active relation kinds. Empty array → legend omits the kinds section. */
  visibleKinds: ReadonlyArray<string>;
  /** When true, the legend shows a soft-reference (mention) edge entry. */
  showMentions: boolean;
};

/**
 * Top-right floating panel describing the graph's visual language under
 * the monochrome model:
 *   - "Nota": real notes render in the bright structural node color.
 *   - "Non risolte": wikilink targets with no file render gray.
 *   - then any active group colors (the sole source of node tinting),
 *   - then relation kinds / soft references for edges.
 *
 * The per-type color legend is intentionally gone: types no longer
 * auto-tint nodes.
 */
export function Legend({ groups, hasUnresolved, visibleKinds, showMentions }: Props): JSX.Element {
  return (
    <div
      aria-label="Legenda"
      className="pointer-events-none absolute right-4 top-16 z-10 max-w-[200px] rounded-lg border border-graph-edge bg-graph-bg/86 p-2 text-xs text-graph-text shadow-lg shadow-black/20 backdrop-blur"
    >
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-graph-text-muted">
          Nodi
        </p>
        <ul className="flex flex-col gap-0.5">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: 'rgb(var(--graph-node))' }}
            />
            <span className="truncate">Nota</span>
          </li>
          {hasUnresolved && (
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'rgb(var(--graph-node-muted))' }}
              />
              <span className="truncate">Non risolte</span>
            </li>
          )}
        </ul>
      </div>

      {groups.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-graph-text-muted">
            Gruppi
          </p>
          <ul className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: g.color }}
                />
                <span className="truncate">{g.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {visibleKinds.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-graph-text-muted">
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

      {showMentions && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-graph-text-muted">
            Riferimenti
          </p>
          <ul className="flex flex-col gap-0.5">
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-0 w-3 shrink-0 border-t border-dashed"
                style={{ borderColor: 'rgb(var(--graph-edge-mention))' }}
              />
              <span className="truncate">Riferimenti deboli</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
