import { useEffect, useState } from 'react';

export type NumberFieldProps = {
  value: number | null;
  onChange: (value: number | null) => void;
};

/**
 * Number input. We hold a string as local state so the user can type
 * intermediate values like "-", "1.", "1e" without us prematurely
 * rejecting them. We only emit a numeric `onChange` when the buffer
 * parses as a finite number, or `null` when the user clears the field.
 */
export function NumberField({ value, onChange }: NumberFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string>(value === null ? '' : String(value));

  // Re-sync when the upstream value changes from a different source
  // (e.g. type-switch, undo). Comparing as strings inside the setter
  // avoids fighting with the user's own keystrokes — and lets us depend
  // only on `value` without tripping exhaustive-deps.
  useEffect(() => {
    const next = value === null ? '' : String(value);
    setDraft((prev) => (prev === next ? prev : next));
  }, [value]);

  return (
    <input
      type="number"
      value={draft}
      onChange={(e): void => {
        const next = e.target.value;
        setDraft(next);
        if (next === '') {
          onChange(null);
          return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      placeholder="Vuoto"
      className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-sm text-fg outline-none hover:border-border focus:border-accent focus:bg-bg-subtle"
    />
  );
}
