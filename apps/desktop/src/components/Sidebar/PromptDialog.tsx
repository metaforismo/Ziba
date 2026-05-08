import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type PromptDialogProps = {
  title: string;
  /** Optional helper text shown above the input. */
  message?: string;
  /** Initial value of the text input. */
  defaultValue?: string;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
  okLabel?: string;
  cancelLabel?: string;
  /**
   * Optional synchronous validator. Returning a non-empty string disables
   * the OK button and surfaces the message under the input. Returning
   * `null` (or an empty string) means the value is valid.
   */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

/**
 * Reusable single-input modal. Used for "Nuova nota", "Nuova cartella" and
 * "Rinomina". Renders into a portal at document.body so it escapes any
 * sidebar overflow/transform contexts.
 */
export function PromptDialog({
  title,
  message,
  defaultValue = '',
  placeholder,
  okLabel = 'OK',
  cancelLabel = 'Annulla',
  validate,
  onSubmit,
  onCancel,
}: PromptDialogProps): JSX.Element | null {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Auto-focus and select-all so renames feel snappy: user types right
    // over the existing name without needing an extra Cmd-A.
    const input = inputRef.current;
    if (input !== null) {
      input.focus();
      input.select();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  const validationError = validate?.(value) ?? null;
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && validationError === null;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e): void => {
        // Click on backdrop cancels; clicks inside the dialog stop here.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-bg p-4 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
      >
        <h2 id="prompt-dialog-title" className="mb-2 text-sm font-semibold text-fg">
          {title}
        </h2>
        {message !== undefined && <p className="mb-3 text-xs text-fg-muted">{message}</p>}
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e): void => setValue(e.target.value)}
          onKeyDown={(e): void => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="w-full rounded border border-border bg-bg-subtle px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
        />
        {validationError !== null && <p className="mt-1 text-xs text-red-500">{validationError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-fg-subtle hover:bg-bg-muted hover:text-fg"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
