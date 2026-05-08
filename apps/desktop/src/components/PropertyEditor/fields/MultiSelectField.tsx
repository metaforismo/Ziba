import { useState } from 'react';

export type MultiSelectFieldProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

/**
 * Chip-input pattern. Existing entries render as removable chips; the
 * trailing input accepts new entries on Enter. Backspace on an empty
 * input pops the last chip (Notion / GitHub-issue style).
 *
 * We keep the typed buffer in local state so the parent only sees
 * committed array changes — nobody wants every keystroke to debounce
 * an autosave for a chip you haven't even pressed Enter on yet.
 */
export function MultiSelectField({ value, onChange }: MultiSelectFieldProps): JSX.Element {
  const [draft, setDraft] = useState('');

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    // De-dupe — a frontmatter list of tags shouldn't have repeats.
    if (value.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...value, trimmed]);
    setDraft('');
  };

  const removeAt = (idx: number): void => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-1 rounded border border-transparent px-1 py-0.5 hover:border-border focus-within:border-accent focus-within:bg-bg-subtle">
      {value.map((chip, idx) => (
        <span
          key={`${idx}-${chip}`}
          className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent"
        >
          <span className="max-w-[12rem] truncate">{chip}</span>
          <button
            type="button"
            onClick={(): void => removeAt(idx)}
            aria-label={`Rimuovi ${chip}`}
            className="text-accent/70 hover:text-accent"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e): void => setDraft(e.target.value)}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            return;
          }
          if (e.key === ',') {
            // Comma-as-delimiter: matches how users actually type tags.
            e.preventDefault();
            commit();
            return;
          }
          if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
            e.preventDefault();
            removeAt(value.length - 1);
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? 'Aggiungi…' : ''}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-fg outline-none"
      />
    </div>
  );
}
