import type { JSX } from 'react';
import { useToastStore, type Toast, type ToastKind } from '../stores/toast';

/**
 * Bottom-right toast stack. Mounted once at the app root next to the
 * search palette. New toasts append to the bottom; the column reverses
 * via flex so the most recent visually appears on top of older ones.
 *
 * Accessibility:
 *   - The container is `role="status" aria-live="polite"` for info /
 *     success / warning so screen readers announce calmly.
 *   - Errors get `role="alert" aria-live="assertive"` to interrupt.
 *   - Each toast renders its own region so multi-toast announcements
 *     don't collapse into a single re-read.
 */
export function ToastStack(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[90vw] flex-col-reverse gap-2"
      data-toast-stack=""
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={(): void => dismiss(t.id)} />
      ))}
    </div>
  );
}

const KIND_CLASSES: Record<ToastKind, string> = {
  info: 'border-fg-muted bg-bg text-fg',
  success: 'border-emerald-500 bg-bg text-fg',
  warning: 'border-amber-500 bg-bg text-fg',
  error: 'border-red-500 bg-bg text-fg',
};

const KIND_LABELS: Record<ToastKind, string> = {
  info: 'Info',
  success: 'Successo',
  warning: 'Attenzione',
  error: 'Errore',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }): JSX.Element {
  const isError = toast.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`pointer-events-auto rounded border px-3 py-2 text-sm shadow-lg ${KIND_CLASSES[toast.kind]}`}
      data-toast-kind={toast.kind}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {toast.title ?? KIND_LABELS[toast.kind]}
          </div>
          <div className="break-words">{toast.message}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Chiudi notifica"
          className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          ×
        </button>
      </div>
    </div>
  );
}
