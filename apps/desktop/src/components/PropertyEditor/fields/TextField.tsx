export type TextFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Single-line text input. We render an uncontrolled-ish controlled input —
 * `value` is always the prop, but we don't trim/normalize on the way out
 * because trailing-space matters for some property kinds (e.g. paths).
 */
export function TextField({ value, onChange }: TextFieldProps): JSX.Element {
  return (
    <input
      type="text"
      value={value}
      onChange={(e): void => onChange(e.target.value)}
      placeholder="Vuoto"
      className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-sm text-fg outline-none hover:border-border focus:border-accent focus:bg-bg-subtle"
    />
  );
}
