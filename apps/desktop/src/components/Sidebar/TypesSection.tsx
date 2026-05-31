import type { JSX } from 'react';
import type { NotePath } from '@ziba/core';
import { CaretDown, CaretRight, FileText } from '@phosphor-icons/react';
import { navigateToNote } from '../../lib/navigate';
import { useEditorStore } from '../../stores/editor';
import { useTagsStore, type TypeSummary } from '../../stores/tags';
import { useUiStore } from '../../stores/ui';

/**
 * Sidebar section listing every typed object in the vault. Mirrors
 * `<TagsSection>` in shape, with two additions:
 *
 *   - Each row shows the type's icon (emoji from the YAML schema) and
 *     its color as a left-side accent stripe — so the type taxonomy is
 *     visually distinct at a glance.
 *   - Selecting a type clears any active tag filter (mutual exclusion
 *     enforced by `useTagsStore.selectType`).
 *
 * The collapsed/expanded state is shared with TagsSection
 * (`useUiStore.tagsExpanded`) so the user toggles "the whole taxonomy
 * panel" with one click. We could split it later if the section
 * counts grow large enough to warrant separate gestures.
 */
export function TypesSection(): JSX.Element {
  const types = useTagsStore((s) => s.types);
  const selectedType = useTagsStore((s) => s.selectedType);
  const notesForSelectedType = useTagsStore((s) => s.notesForSelectedType);
  const selectType = useTagsStore((s) => s.selectType);
  const expanded = useUiStore((s) => s.typesExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleTypes);
  const currentPath = useEditorStore((s) => s.currentPath);

  const handleClick = (id: string): void => {
    if (selectedType === id) {
      void selectType(null);
      return;
    }
    void selectType(id);
  };

  const handleNoteClick = (path: NotePath): void => {
    void navigateToNote(path);
  };

  return (
    <section className="shrink-0 border-b border-border" aria-label="Tipi">
      <button
        type="button"
        onClick={toggleExpanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block w-3 text-center">
            {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
          </span>
          <span>Tipi</span>
        </span>
        <span
          className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-fg-muted"
          aria-label={`${types.length} tipi totali`}
        >
          {types.length}
        </span>
      </button>

      {expanded && (
        <div className="px-1 pb-2">
          {types.length === 0 ? (
            // Didactic empty state. Without it a v0.x user wouldn't
            // know the feature exists. The hint is intentionally
            // light-touch — once at least one note is typed, the
            // section auto-populates.
            <p className="px-2 py-2 text-xs text-fg-muted">
              Aggiungi <code className="font-mono">type: &lt;slug&gt;</code> nel frontmatter di una
              nota per categorizzarla. Gli schema vivono in{' '}
              <code className="font-mono">.ziba/schema/</code>.
            </p>
          ) : (
            <ul role="list" className="max-h-[200px] space-y-px overflow-y-auto">
              {types.map((t) => (
                <TypeRow
                  key={t.id}
                  type={t}
                  active={selectedType === t.id}
                  onClick={(): void => handleClick(t.id)}
                />
              ))}
            </ul>
          )}

          {selectedType !== null && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                  Note di tipo{' '}
                  <span className="normal-case tracking-normal text-fg-subtle">
                    {labelForId(types, selectedType)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(): void => {
                    void selectType(null);
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
                >
                  Mostra tutti
                </button>
              </div>

              {notesForSelectedType.length === 0 ? (
                <p className="px-2 py-1 text-xs text-fg-muted">Nessuna nota di questo tipo.</p>
              ) : (
                <ul role="list" className="max-h-[180px] space-y-px overflow-y-auto">
                  {notesForSelectedType.map((n) => {
                    const active = currentPath === n.path;
                    return (
                      <li key={n.path}>
                        <button
                          type="button"
                          onClick={(): void => handleNoteClick(n.path)}
                          title={n.path}
                          className={
                            'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm ' +
                            (active
                              ? 'bg-accent/10 text-fg'
                              : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
                          }
                        >
                          <span aria-hidden="true" className="shrink-0 text-fg-muted">
                            <FileText size={15} />
                          </span>
                          <span className="truncate">{n.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TypeRow({
  type,
  active,
  onClick,
}: {
  type: TypeSummary;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  // Color stripe down the left side of the row. Falls back to a
  // neutral border when the schema didn't declare a color.
  const stripeStyle = type.color !== null ? { borderLeftColor: type.color } : undefined;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title={type.id}
        aria-pressed={active}
        style={stripeStyle}
        className={
          'flex w-full items-center justify-between gap-2 rounded border-l-[3px] px-2 py-1 text-left text-sm ' +
          (type.color === null ? 'border-l-border ' : '') +
          (active ? 'bg-accent/10 text-fg' : 'text-fg-subtle hover:bg-bg-muted hover:text-fg')
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="shrink-0">
            {type.icon ?? '◆'}
          </span>
          <span className="truncate">{type.label}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">{type.count}</span>
      </button>
    </li>
  );
}

function labelForId(types: TypeSummary[], id: string): string {
  return types.find((t) => t.id === id)?.label ?? id;
}
