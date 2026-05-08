export type DateFieldProps = {
  /** ISO date string (YYYY-MM-DD), or empty string when unset. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * Native date picker. We rely on the browser's `<input type="date">`
 * widget — it returns the value as `YYYY-MM-DD` already, which is the
 * exact shape we store in frontmatter. No timezone juggling needed.
 */
export function DateField({ value, onChange }: DateFieldProps): JSX.Element {
  return (
    <input
      type="date"
      value={value}
      onChange={(e): void => onChange(e.target.value)}
      className="w-full rounded border border-transparent bg-transparent px-2 py-0.5 text-sm text-fg outline-none hover:border-border focus:border-accent focus:bg-bg-subtle"
    />
  );
}
