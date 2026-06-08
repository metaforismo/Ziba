import { useEffect, useRef, useState, type JSX } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';

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
 * "Rinomina". Owns only the input + validation logic; the modal shell
 * (portal, backdrop, focus-trap, Escape/backdrop dismissal, focus-return)
 * comes from `ui/Dialog`. Callers conditionally render it, so it is always
 * `open` while mounted.
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
    // Select-all on open so renames feel snappy: the user types right over
    // the existing name without an extra Cmd-A. Dialog focuses the input
    // (via initialFocusRef); we only add the selection here. Order-independent
    // because focusing an input preserves an existing selection.
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const validationError = validate?.(value) ?? null;
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && validationError === null;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {okLabel}
          </Button>
        </>
      }
    >
      {message !== undefined && <p className="mb-3 text-xs text-fg-muted">{message}</p>}
      <Input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e): void => setValue(e.target.value)}
        onKeyDown={(e): void => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      {validationError !== null && <p className="mt-1 text-xs text-red-500">{validationError}</p>}
    </Dialog>
  );
}
