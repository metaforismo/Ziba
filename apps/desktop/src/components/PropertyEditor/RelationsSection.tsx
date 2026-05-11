import { useMemo, useState } from 'react';
import type { Frontmatter } from '@ziba/core';
import {
  relationsFromFrontmatter,
  setRelationInFrontmatter,
  removeRelationFromFrontmatter,
} from '../../lib/relations-frontmatter';

export type RelationsSectionProps = {
  frontmatter: Frontmatter;
  /**
   * Relation kinds suggested for the current note's type (schema's
   * `relations` keys). Empty array is fine; the user can free-type a
   * kind via the autocomplete.
   */
  suggestedKinds: ReadonlyArray<string>;
  onChange(next: Frontmatter): void;
};

/**
 * Section sibling to the properties block, dedicated to
 * `frontmatter.relations`. Each row shows `kind → target` with an
 * inline delete; the "Aggiungi relazione" button reveals a kind +
 * target form. Edit-in-place is intentionally NOT supported in v1.0:
 * change a relation by removing and re-adding it.
 */
export function RelationsSection({
  frontmatter,
  suggestedKinds,
  onChange,
}: RelationsSectionProps): JSX.Element {
  const rows = useMemo(() => relationsFromFrontmatter(frontmatter), [frontmatter]);

  const [adding, setAdding] = useState(false);
  const [kindDraft, setKindDraft] = useState('');
  const [targetDraft, setTargetDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancelAdd = (): void => {
    setAdding(false);
    setKindDraft('');
    setTargetDraft('');
    setError(null);
  };

  const commitAdd = (): void => {
    const kind = kindDraft.trim();
    const target = targetDraft.trim();
    if (kind.length === 0 || target.length === 0) {
      setError('Tipo e destinazione sono entrambi obbligatori.');
      return;
    }
    onChange(setRelationInFrontmatter(frontmatter, kind, target));
    cancelAdd();
  };

  return (
    <section className="shrink-0 border-b border-border bg-bg px-4 py-2">
      <div className="mx-auto max-w-[720px]">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
          Relazioni{rows.length > 0 ? ` (${rows.length})` : ''}
        </h3>

        {rows.length === 0 ? (
          <p className="px-1 py-1 text-xs italic text-fg-muted">Nessuna relazione dichiarata.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {rows.map((r) => (
              <li
                key={`${r.kind}|${r.target}`}
                className="group flex min-h-[28px] items-center gap-2 rounded px-1 hover:bg-bg-subtle focus-within:bg-bg-subtle"
              >
                <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-fg-muted">
                  {r.kind}
                </span>
                <span aria-hidden="true" className="text-fg-muted">
                  →
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.target}</span>
                <button
                  type="button"
                  aria-label={`Rimuovi relazione ${r.kind} → ${r.target}`}
                  onClick={(): void =>
                    onChange(removeRelationFromFrontmatter(frontmatter, r.kind, r.target))
                  }
                  className="rounded px-1 text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg-muted hover:text-fg focus:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <div className="mt-1 flex flex-col gap-1 rounded border border-border bg-bg-subtle p-2">
            <input
              autoFocus
              type="text"
              value={kindDraft}
              placeholder="Tipo"
              list="ziba-relation-kinds"
              onChange={(e): void => {
                setKindDraft(e.target.value);
                setError(null);
              }}
              className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
            />
            {suggestedKinds.length > 0 && (
              <datalist id="ziba-relation-kinds">
                {suggestedKinds.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            )}
            <input
              type="text"
              value={targetDraft}
              placeholder="Destinazione"
              onChange={(e): void => {
                setTargetDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e): void => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAdd();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelAdd();
                }
              }}
              className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
            />
            {error !== null && <span className="text-xs text-red-500">{error}</span>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelAdd}
                className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={commitAdd}
                className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90"
              >
                Aggiungi
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={(): void => setAdding(true)}
            className="mt-1 self-start rounded px-2 py-1 text-xs text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            + Aggiungi relazione
          </button>
        )}
      </div>
    </section>
  );
}
