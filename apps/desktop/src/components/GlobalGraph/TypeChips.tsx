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
  return [
    'rounded-md border px-2 py-1 text-[12px] shadow-lg shadow-black/10 backdrop-blur transition-colors',
    active
      ? 'border-[#85858c] bg-[#343438]/90 text-[#f4f4f5]'
      : 'border-[#3a3a3f] bg-[#242426]/82 text-[#bfc0c6] hover:border-[#4d4d54] hover:bg-[#303034] hover:text-[#f4f4f5]',
  ].join(' ');
}
