import type { JSX } from 'react';
import type {
  DatabaseRow,
  DetectedProperty,
  PropertyType,
  ScalarFilter,
} from '../../../shared/ipc';

type Props = {
  filters: ScalarFilter[];
  /** Property keys aggregated across all returned rows, alphabetically sorted. */
  availableProperties: string[];
  /**
   * Sample rows we use to detect each property's type. The detection result
   * drives both the operator dropdown and the value-input coercion.
   */
  rows: DatabaseRow[];
  onAdd(filter: ScalarFilter): void;
  onUpdate(index: number, filter: ScalarFilter): void;
  onRemove(index: number): void;
};

/**
 * Operator vocabulary per detected type. We expose `has`/`lacks` for every
 * non-boolean type because "is the property present?" is a frequent
 * filtering question for users curating a database. Booleans collapse to a
 * single equality check.
 */
const OPERATORS_BY_TYPE: Record<PropertyType, ScalarFilter['kind'][]> = {
  text: ['eq', 'contains', 'has', 'lacks'],
  url: ['eq', 'contains', 'has', 'lacks'],
  number: ['eq', 'lt', 'lte', 'gte', 'gt', 'has', 'lacks'],
  boolean: ['eq'],
  date: ['eq', 'lt', 'lte', 'gte', 'gt', 'has', 'lacks'],
  'string-array': ['contains', 'has', 'lacks'],
};

const OPERATOR_LABELS: Record<ScalarFilter['kind'], string> = {
  eq: '=',
  in: 'in',
  has: 'esiste',
  lacks: 'manca',
  lt: '<',
  lte: '≤',
  gte: '≥',
  gt: '>',
  contains: 'contiene',
};

/** Operators that don't need a value input (presence checks). */
function isUnaryOp(kind: ScalarFilter['kind']): boolean {
  return kind === 'has' || kind === 'lacks';
}

/**
 * Detect the type of the given property key by sampling rows. If no rows
 * carry the key (e.g. user just added a filter on a key with empty value
 * everywhere) we fall back to `text` so the input stays usable.
 */
function detectType(key: string, rows: DatabaseRow[]): PropertyType {
  for (const row of rows) {
    const prop: DetectedProperty | undefined = row.properties[key];
    if (prop !== undefined) return prop.type;
  }
  return 'text';
}

/**
 * Coerce the raw input string to the value shape `ScalarFilter` expects
 * for the given operator/type pair. We deliberately keep numbers as
 * numbers and booleans as booleans — the SQLite adapter binds parameters
 * by JS type, so passing the wrong shape would silently never match.
 */
function coerceValue(
  raw: string,
  type: PropertyType,
  kind: ScalarFilter['kind'],
): string | number | boolean {
  if (type === 'boolean' && kind === 'eq') {
    return raw === 'true';
  }
  if (
    type === 'number' &&
    (kind === 'eq' || kind === 'lt' || kind === 'lte' || kind === 'gte' || kind === 'gt')
  ) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

/**
 * Extract the displayable value of a filter for the value input. We ignore
 * `in` because v0.3 doesn't expose it from the UI yet (operator dropdown
 * doesn't include it).
 */
function valueOf(filter: ScalarFilter): string {
  switch (filter.kind) {
    case 'eq':
      if (typeof filter.value === 'boolean') return filter.value ? 'true' : 'false';
      return String(filter.value);
    case 'lt':
    case 'lte':
    case 'gte':
    case 'gt':
    case 'contains':
      return String(filter.value);
    case 'in':
      return filter.values.join(', ');
    case 'has':
    case 'lacks':
      return '';
  }
}

/**
 * Build a fresh filter object from the (key, kind, raw value, type) tuple.
 * Pure factory — keeps the JSX above readable and centralises the
 * discriminated-union construction.
 */
function buildFilter(
  key: string,
  kind: ScalarFilter['kind'],
  raw: string,
  type: PropertyType,
): ScalarFilter {
  switch (kind) {
    case 'has':
      return { kind: 'has', key };
    case 'lacks':
      return { kind: 'lacks', key };
    case 'eq': {
      const v = coerceValue(raw, type, 'eq');
      return { kind: 'eq', key, value: v };
    }
    case 'contains':
      return { kind: 'contains', key, value: raw };
    case 'lt':
    case 'lte':
    case 'gte':
    case 'gt': {
      const v = coerceValue(raw, type, kind);
      // Number/string values both supported by `lt|gte|...` so we don't
      // need to narrow further — TS accepts the union.
      return { kind, key, value: v as string | number };
    }
    case 'in':
      // Not constructible from the v0.3 UI; pass through as-is.
      return { kind: 'in', key, values: raw.split(',').map((s) => s.trim()) };
  }
}

/** Single editable row inside the filter bar. */
function FilterRow({
  filter,
  index,
  availableProperties,
  rows,
  onUpdate,
  onRemove,
}: {
  filter: ScalarFilter;
  index: number;
  availableProperties: string[];
  rows: DatabaseRow[];
  onUpdate(index: number, next: ScalarFilter): void;
  onRemove(index: number): void;
}): JSX.Element {
  const type = detectType(filter.key, rows);
  const operators = OPERATORS_BY_TYPE[type];
  const currentValue = valueOf(filter);
  const showValue = !isUnaryOp(filter.kind);

  // The available-properties list might not contain a key the user filtered
  // on (e.g. a filter that excludes every row that had the key). Inject the
  // active key so the dropdown stays consistent.
  const propertyOptions = availableProperties.includes(filter.key)
    ? availableProperties
    : [filter.key, ...availableProperties];

  return (
    <div className="flex items-center gap-1 rounded border border-border bg-bg-subtle px-1.5 py-1 text-xs">
      <select
        value={filter.key}
        aria-label="Proprietà"
        onChange={(e): void => {
          const nextKey = e.target.value;
          const nextType = detectType(nextKey, rows);
          // Try to keep the same operator if it remains valid for the new
          // type; otherwise fall back to the first operator the new type
          // supports. Drops the value when switching away from a typed op.
          const nextOps = OPERATORS_BY_TYPE[nextType];
          const nextKind = nextOps.includes(filter.kind) ? filter.kind : nextOps[0]!;
          onUpdate(index, buildFilter(nextKey, nextKind, currentValue, nextType));
        }}
        className="max-w-[140px] rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        {propertyOptions.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      <select
        value={filter.kind}
        aria-label="Operatore"
        onChange={(e): void => {
          const nextKind = e.target.value as ScalarFilter['kind'];
          onUpdate(index, buildFilter(filter.key, nextKind, currentValue, type));
        }}
        className="rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>

      {showValue && (
        <ValueInput
          type={type}
          kind={filter.kind}
          value={currentValue}
          onChange={(raw): void => {
            onUpdate(index, buildFilter(filter.key, filter.kind, raw, type));
          }}
        />
      )}

      <button
        type="button"
        aria-label="Rimuovi filtro"
        onClick={(): void => onRemove(index)}
        className="ml-0.5 rounded px-1 text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Type-aware value input. Emits the raw string back to the parent; the
 * parent calls `coerceValue` via `buildFilter` to land it in the right
 * runtime shape on the filter object.
 */
function ValueInput({
  type,
  kind,
  value,
  onChange,
}: {
  type: PropertyType;
  kind: ScalarFilter['kind'];
  value: string;
  onChange(raw: string): void;
}): JSX.Element {
  if (type === 'boolean' && kind === 'eq') {
    return (
      <select
        aria-label="Valore"
        value={value === 'true' ? 'true' : 'false'}
        onChange={(e): void => onChange(e.target.value)}
        className="rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="true">vero</option>
        <option value="false">falso</option>
      </select>
    );
  }
  if (type === 'date') {
    return (
      <input
        type="date"
        aria-label="Valore"
        value={value}
        onChange={(e): void => onChange(e.target.value)}
        className="rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      />
    );
  }
  if (type === 'number') {
    return (
      <input
        type="number"
        aria-label="Valore"
        value={value}
        onChange={(e): void => onChange(e.target.value)}
        className="w-20 rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent"
      />
    );
  }
  return (
    <input
      type="text"
      aria-label="Valore"
      value={value}
      onChange={(e): void => onChange(e.target.value)}
      placeholder="Valore"
      className="w-32 rounded bg-bg px-1 py-0.5 text-fg outline-none focus:ring-1 focus:ring-accent placeholder:text-fg-muted"
    />
  );
}

/**
 * Filter bar — chips for active filters + an "Aggiungi filtro" button. We
 * keep this stateless: the parent owns `filters` and reacts to mutations
 * via the `on*` callbacks.
 */
export function FilterBar({
  filters,
  availableProperties,
  rows,
  onAdd,
  onUpdate,
  onRemove,
}: Props): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {filters.map((f, i) => (
        <FilterRow
          key={`${f.key}-${i}`}
          filter={f}
          index={i}
          availableProperties={availableProperties}
          rows={rows}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
      <button
        type="button"
        onClick={(): void => {
          // Default new filter targets the first available property so the
          // user only has to click once to get a valid predicate. If no
          // properties are detected yet we fall back to a placeholder
          // string — the user can rename it via the property dropdown.
          const key = availableProperties[0] ?? 'tags';
          onAdd({ kind: 'has', key });
        }}
        disabled={availableProperties.length === 0}
        className="rounded border border-dashed border-border px-1.5 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Aggiungi filtro
      </button>
    </div>
  );
}
