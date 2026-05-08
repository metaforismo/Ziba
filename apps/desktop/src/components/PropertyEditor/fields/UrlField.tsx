export type UrlFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * URL input + a small "open in new tab" affordance. The button is
 * disabled when the value isn't a parseable HTTP(S) URL so we don't
 * call `window.open` with garbage and trip popup blockers.
 */
export function UrlField({ value, onChange }: UrlFieldProps): JSX.Element {
  let canOpen = false;
  if (/^https?:\/\//i.test(value)) {
    try {
      // Force-validate via URL constructor so we don't try to open
      // strings that match the prefix but are otherwise malformed
      // (e.g. "https://").
      new URL(value);
      canOpen = true;
    } catch {
      canOpen = false;
    }
  }

  return (
    <div className="flex w-full items-center gap-1">
      <input
        type="url"
        value={value}
        onChange={(e): void => onChange(e.target.value)}
        placeholder="https://"
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-0.5 text-sm text-fg outline-none hover:border-border focus:border-accent focus:bg-bg-subtle"
      />
      <button
        type="button"
        onClick={(): void => {
          if (!canOpen) return;
          window.open(value, '_blank', 'noopener,noreferrer');
        }}
        disabled={!canOpen}
        title="Apri in una nuova scheda"
        aria-label="Apri URL in una nuova scheda"
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-fg-muted hover:bg-bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↗
      </button>
    </div>
  );
}
