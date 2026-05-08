export type BooleanFieldProps = {
  value: boolean;
  onChange: (value: boolean) => void;
};

/**
 * Plain checkbox. We center it within the value column so it doesn't
 * float to the far left and disconnect visually from the row.
 */
export function BooleanField({ value, onChange }: BooleanFieldProps): JSX.Element {
  return (
    <label className="flex h-full cursor-pointer items-center px-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e): void => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-accent"
      />
    </label>
  );
}
