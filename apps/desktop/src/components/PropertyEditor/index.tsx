import { useMemo, useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import type { Frontmatter, PropertyType, SwitchableType } from './types';
import { SWITCHABLE_TYPES, detectPropertyType } from './types';
import { PropertyHeader } from './PropertyHeader';
import { TextField } from './fields/TextField';
import { NumberField } from './fields/NumberField';
import { BooleanField } from './fields/BooleanField';
import { DateField } from './fields/DateField';
import { UrlField } from './fields/UrlField';
import { MultiSelectField } from './fields/MultiSelectField';
import { UnsupportedField } from './fields/UnsupportedField';
import { RelationsSection } from './RelationsSection';

export type PropertyEditorProps = {
  frontmatter: Frontmatter;
  onChange: (next: Frontmatter) => void;
  /**
   * Relation kinds suggested for the current type, surfaced as an
   * autocomplete in the "Aggiungi relazione" form. Empty array = no
   * suggestions (untyped note or schema-less type).
   */
  suggestedRelationKinds?: ReadonlyArray<string>;
};

/**
 * Convert a value into the runtime shape expected for the given target
 * type when the user manually switches a property's type. We pick safe
 * defaults rather than throwing, since the user can always fix the
 * value afterwards in the typed input.
 */
function coerceForType(value: unknown, target: SwitchableType): unknown {
  switch (target) {
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (value === null || value === undefined) return '';
      return '';
    case 'number': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    }
    case 'date': {
      // Already-ISO strings pass through; everything else resets to empty
      // and lets the user pick from the date picker.
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }
      return '';
    }
    case 'url': {
      if (typeof value === 'string') return value;
      return '';
    }
  }
}

/**
 * Replace a key in a frontmatter object while preserving insertion order.
 * Plain `{ ...fm, [newKey]: fm[oldKey] }` would put the renamed key at
 * the end; iterating manually keeps the row exactly where it was.
 */
function renameKey(fm: Frontmatter, oldKey: string, newKey: string): Frontmatter {
  const next: Frontmatter = {};
  for (const [k, v] of Object.entries(fm)) {
    if (k === oldKey) {
      next[newKey] = v;
    } else {
      next[k] = v;
    }
  }
  return next;
}

/**
 * Normalize values that gray-matter might surface in shapes our editors
 * can't consume directly — chiefly Date instances, which it emits when
 * YAML contains a bare `2024-01-01`. We collapse those to ISO strings
 * so the date detection / DateField round-trips cleanly.
 */
function normalizeIncoming(value: unknown): unknown {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Properties section above the Tiptap body. Renders one row per
 * frontmatter key with a typed input on the right. The component is
 * stateless w.r.t. frontmatter — the source of truth is `props.frontmatter`,
 * and every edit calls `onChange` with the new object. User-chosen type
 * overrides live in local state so they survive cross-renders without
 * leaking into the on-disk frontmatter (gray-matter would happily round
 * the override away).
 */
export function PropertyEditor({
  frontmatter,
  onChange,
  suggestedRelationKinds,
}: PropertyEditorProps): JSX.Element {
  // Per-key type override: when the user clicks the type icon and picks
  // a different switchable type, we record it here. Detection still
  // runs first; the override only applies when present.
  const [overrides, setOverrides] = useState<Record<string, SwitchableType>>({});

  // "Add property" inline form state.
  const [adding, setAdding] = useState(false);
  const [newKeyDraft, setNewKeyDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Keep metadata out of the way on first open; users can expand it
  // when they need structured fields.
  const [collapsed, setCollapsed] = useState(true);

  const entries = useMemo(() => Object.entries(frontmatter), [frontmatter]);

  const resolveType = (key: string, value: unknown): PropertyType => {
    const override = overrides[key];
    if (override !== undefined) return override;
    return detectPropertyType(value, key);
  };

  const updateValue = (key: string, nextValue: unknown): void => {
    const next: Frontmatter = { ...frontmatter, [key]: nextValue };
    onChange(next);
  };

  const handleRename = (oldKey: string, newKey: string): void => {
    if (oldKey === newKey) return;
    onChange(renameKey(frontmatter, oldKey, newKey));
    // Migrate the override along with the rename so the user doesn't
    // lose their type choice.
    setOverrides((prev) => {
      const moved = prev[oldKey];
      if (moved === undefined) return prev;
      const next: Record<string, SwitchableType> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k === oldKey) continue;
        next[k] = v;
      }
      next[newKey] = moved;
      return next;
    });
  };

  const handleDelete = (key: string): void => {
    const next: Frontmatter = {};
    for (const [k, v] of Object.entries(frontmatter)) {
      if (k !== key) next[k] = v;
    }
    onChange(next);
    setOverrides((prev) => {
      if (prev[key] === undefined) return prev;
      const result: Record<string, SwitchableType> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (k !== key) result[k] = v;
      }
      return result;
    });
  };

  const handleSwitchType = (key: string, target: SwitchableType): void => {
    const current = frontmatter[key];
    const coerced = coerceForType(current, target);
    setOverrides((prev) => ({ ...prev, [key]: target }));
    if (coerced !== current) {
      onChange({ ...frontmatter, [key]: coerced });
    }
  };

  const validateRename =
    (oldKey: string) =>
    (next: string): string | null => {
      if (next.length === 0) return 'Il nome non può essere vuoto.';
      if (next === oldKey) return null;
      if (Object.prototype.hasOwnProperty.call(frontmatter, next)) {
        return 'Esiste già una proprietà con questo nome.';
      }
      return null;
    };

  const handleAddProperty = (): void => {
    const trimmed = newKeyDraft.trim();
    if (trimmed.length === 0) {
      setAddError('Il nome non può essere vuoto.');
      return;
    }
    if (Object.prototype.hasOwnProperty.call(frontmatter, trimmed)) {
      setAddError('Esiste già una proprietà con questo nome.');
      return;
    }
    onChange({ ...frontmatter, [trimmed]: '' });
    setNewKeyDraft('');
    setAddError(null);
    setAdding(false);
    setCollapsed(false);
  };

  const cancelAdd = (): void => {
    setNewKeyDraft('');
    setAddError(null);
    setAdding(false);
  };

  const renderField = (key: string, type: PropertyType, value: unknown): JSX.Element => {
    switch (type) {
      case 'text': {
        const v =
          typeof value === 'string'
            ? value
            : value === null || value === undefined
              ? ''
              : String(value);
        return <TextField value={v} onChange={(next): void => updateValue(key, next)} />;
      }
      case 'number': {
        const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
        return (
          <NumberField
            value={v}
            onChange={(next): void => updateValue(key, next === null ? '' : next)}
          />
        );
      }
      case 'boolean': {
        const v = typeof value === 'boolean' ? value : false;
        return <BooleanField value={v} onChange={(next): void => updateValue(key, next)} />;
      }
      case 'date': {
        let v = '';
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          v = value;
        } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
          v = value.toISOString().slice(0, 10);
        }
        return <DateField value={v} onChange={(next): void => updateValue(key, next)} />;
      }
      case 'url': {
        const v = typeof value === 'string' ? value : '';
        return <UrlField value={v} onChange={(next): void => updateValue(key, next)} />;
      }
      case 'multi-select':
      case 'tags': {
        const v =
          Array.isArray(value) && value.every((x) => typeof x === 'string')
            ? (value as string[])
            : [];
        return <MultiSelectField value={v} onChange={(next): void => updateValue(key, next)} />;
      }
      case 'unsupported':
      default:
        return <UnsupportedField value={value} />;
    }
  };

  const isEmpty = entries.length === 0;
  const propertyCountLabel = isEmpty ? '' : ` (${entries.length})`;

  return (
    <>
      <section className="shrink-0 border-b border-border bg-bg px-4 py-2">
        <div className="mx-auto max-w-[720px]">
          <button
            type="button"
            onClick={(): void => setCollapsed((v) => !v)}
            className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
          >
            <span className="inline-flex w-3 justify-center" aria-hidden="true">
              {collapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
            </span>
            <span>Proprietà{propertyCountLabel}</span>
          </button>

          {!collapsed && (
            <div className="flex flex-col gap-0.5">
              {entries.map(([key, rawValue]) => {
                const value = normalizeIncoming(rawValue);
                const type = resolveType(key, value);
                // The user can only switch INTO a type that's in
                // SWITCHABLE_TYPES; we further hide the current type
                // from its own menu so it doesn't act as a no-op entry.
                // For non-switchable starting types (boolean,
                // multi-select, tags, unsupported) we still let them
                // pivot to text/number/date/url to recover.
                const switchableTo = SWITCHABLE_TYPES.filter((t) => t !== type);
                return (
                  <div
                    key={key}
                    className="group flex min-h-[28px] items-start gap-2 rounded hover:bg-bg-subtle"
                  >
                    <PropertyHeader
                      name={key}
                      type={type}
                      switchableTo={switchableTo}
                      validateRename={validateRename(key)}
                      onRename={(next): void => handleRename(key, next)}
                      onSwitchType={(target): void => handleSwitchType(key, target)}
                      onDelete={(): void => handleDelete(key)}
                    />
                    <div className="flex min-w-0 flex-1 items-center py-0.5">
                      {renderField(key, type, value)}
                    </div>
                  </div>
                );
              })}

              {adding ? (
                <div className="mt-1 flex flex-col gap-1 rounded border border-border bg-bg-subtle p-2">
                  <input
                    autoFocus
                    type="text"
                    value={newKeyDraft}
                    placeholder="Nome proprietà"
                    onChange={(e): void => {
                      setNewKeyDraft(e.target.value);
                      setAddError(null);
                    }}
                    onKeyDown={(e): void => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddProperty();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelAdd();
                      }
                    }}
                    className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
                  />
                  {addError !== null && <span className="text-xs text-red-500">{addError}</span>}
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
                      onClick={handleAddProperty}
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
                  + Aggiungi proprietà
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      <RelationsSection
        frontmatter={frontmatter}
        suggestedKinds={suggestedRelationKinds ?? []}
        onChange={onChange}
      />
    </>
  );
}
