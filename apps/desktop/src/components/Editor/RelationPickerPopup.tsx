import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type RelationPickerPopupProps = {
  /** Page-coordinate anchor (same shape as SlashMenuPopup). */
  position: { top: number; left: number; bottom: number };
  /**
   * Relation kinds suggested for the current note's type — surfaced
   * as quick-pick chips. Empty array is fine: the user can free-type
   * a kind.
   */
  suggestedKinds: ReadonlyArray<string>;
  onCommit(args: { kind: string; target: string }): void;
  onCancel(): void;
};

const POPUP_HEIGHT_ESTIMATE = 260;

/**
 * Two-field popover triggered by the `/relazione` slash command. Kind
 * + target as free-text inputs with optional schema-derived
 * quick-pick chips. Commit button stays disabled until both fields
 * carry non-empty trimmed text.
 *
 * The wikilink autocomplete that powers `[[...]]` is intentionally
 * NOT reused here: the kind field is unrelated, and a richer target
 * picker is a v1.1 follow-up once we have user signal.
 */
export function RelationPickerPopup(props: RelationPickerPopupProps): JSX.Element | null {
  const { position, suggestedKinds, onCommit, onCancel } = props;

  const [kind, setKind] = useState('');
  const [target, setTarget] = useState('');
  const kindInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    kindInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return (): void => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Flip above the trigger when there's not enough room below — same
  // heuristic the SlashMenuPopup uses, no Floating UI dependency.
  const placement = useMemo(() => {
    if (typeof window === 'undefined') {
      return { top: position.bottom + 4, left: position.left };
    }
    const wouldOverflow = position.bottom + POPUP_HEIGHT_ESTIMATE > window.innerHeight;
    if (wouldOverflow && position.top - POPUP_HEIGHT_ESTIMATE > 0) {
      return { top: position.top - POPUP_HEIGHT_ESTIMATE - 4, left: position.left };
    }
    return { top: position.bottom + 4, left: position.left };
  }, [position.top, position.bottom, position.left]);

  if (typeof document === 'undefined') return null;

  const canCommit = kind.trim().length > 0 && target.trim().length > 0;

  const commit = (): void => {
    if (!canCommit) return;
    onCommit({ kind: kind.trim(), target: target.trim() });
  };

  return createPortal(
    <div
      role="dialog"
      aria-label="Aggiungi relazione"
      className="fixed z-50 w-72 rounded-md border border-border bg-bg-subtle p-3 shadow-lg"
      style={{ top: placement.top, left: placement.left }}
    >
      <div className="flex flex-col gap-2">
        <input
          ref={kindInputRef}
          type="text"
          value={kind}
          placeholder="Tipo di relazione"
          onChange={(e): void => setKind(e.target.value)}
          onKeyDown={(e): void => {
            if (e.key === 'Enter' && canCommit) {
              e.preventDefault();
              commit();
            }
          }}
          className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
        />

        {suggestedKinds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedKinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={(): void => setKind(k)}
                className="rounded border border-border bg-bg px-2 py-0.5 text-xs text-fg-subtle hover:bg-accent/10 hover:text-fg"
              >
                {k}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={target}
          placeholder="Nota di destinazione"
          onChange={(e): void => setTarget(e.target.value)}
          onKeyDown={(e): void => {
            if (e.key === 'Enter' && canCommit) {
              e.preventDefault();
              commit();
            }
          }}
          className="rounded border border-border bg-bg px-2 py-1 text-sm text-fg outline-none focus:border-accent"
        />

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-muted hover:text-fg"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!canCommit}
            className="rounded bg-accent px-2 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Inserisci
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
