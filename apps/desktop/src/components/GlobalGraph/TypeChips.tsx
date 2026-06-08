import type { JSX } from 'react';

export type TypeChip = {
  /** Slug. */
  id: string;
  /** Display label (schema label or slug fallback). */
  label: string;
  /** Optional icon glyph from the schema. */
  icon: string | null;
  /** Optional schema color used as the chip's left-border tint. */
  color: string | null;
};

type Props = {
  types: ReadonlyArray<TypeChip>;
  selectedType: string | null;
  onChange(type: string | null): void;
};

/**
 * Single-select chip row for the constellation graph header. "Tutti"
 * resets to null (no scope). Each typed chip toggles to its slug; if
 * already active, clicking again clears (back to Tutti). Mirrors the
 * Notion-style filter chip pattern.
 */
export function TypeChips({ types, selectedType, onChange }: Props): JSX.Element {
  return (
    <div role="group" aria-label="Filtra per tipo" className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={(): void => onChange(null)}
        aria-pressed={selectedType === null}
        className={chipClasses(selectedType === null)}
      >
        Tutti
      </button>
      {types.map((t) => {
        const isActive = t.id === selectedType;
        const iconPrefix = t.icon !== null && t.icon !== '' ? `${t.icon} ` : '';
        const borderStyle: React.CSSProperties | undefined =
          t.color !== null ? { borderLeftColor: t.color, borderLeftWidth: 3 } : undefined;
        return (
          <button
            key={t.id}
            type="button"
            onClick={(): void => onChange(isActive ? null : t.id)}
            aria-pressed={isActive}
            style={borderStyle}
            className={chipClasses(isActive)}
          >
            {`${iconPrefix}${t.label}`}
          </button>
        );
      })}
    </div>
  );
}

function chipClasses(active: boolean): string {
  // Token-based so the type chips on the graph's bottom toolbar follow the
  // active theme (previously dark-only hex rendered wrong on light themes).
  return [
    'rounded-md border px-2 py-1 text-[12px] shadow-lg shadow-black/10 backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-graph-selection/50',
    active
      ? 'border-graph-border-strong bg-graph-hover/90 text-graph-text'
      : 'border-graph-edge bg-graph-surface/82 text-graph-text-muted hover:border-graph-border-strong hover:bg-graph-hover hover:text-graph-text',
  ].join(' ');
}
