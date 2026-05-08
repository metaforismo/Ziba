export type UnsupportedFieldProps = {
  value: unknown;
};

/**
 * Read-only rendering for property values v0.2 doesn't know how to edit
 * (nested objects, arrays of mixed types, etc.). We pretty-print the
 * JSON in a `<pre>` and surface a hint so users understand why the
 * field isn't editable instead of silently dropping it.
 */
export function UnsupportedField({ value }: UnsupportedFieldProps): JSX.Element {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    // Cyclic / non-serializable values shouldn't realistically reach us
    // (gray-matter only emits JSON-compatible YAML), but degrade safely.
    serialized = String(value);
  }
  return (
    <div className="flex w-full flex-col gap-0.5 px-2 py-0.5">
      <span className="text-xs italic text-fg-muted">Tipo non supportato in v0.2</span>
      <pre className="max-h-32 overflow-auto rounded bg-bg-muted px-2 py-1 text-xs text-fg-subtle">
        {serialized}
      </pre>
    </div>
  );
}
