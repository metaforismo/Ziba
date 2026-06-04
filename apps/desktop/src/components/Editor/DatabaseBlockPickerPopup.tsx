import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DatabaseViewDefinition } from '../../../shared/ipc';

export type DatabaseBlockPickerPopupProps = {
  position: { top: number; left: number; bottom: number };
  views: readonly DatabaseViewDefinition[];
  loading: boolean;
  error: string | null;
  onSelect(viewId: string): void;
  onCreateQuick(): void;
  onCancel(): void;
};

const POPUP_HEIGHT_ESTIMATE = 300;

export function DatabaseBlockPickerPopup(props: DatabaseBlockPickerPopupProps): JSX.Element | null {
  const { position, views, loading, error, onSelect, onCreateQuick, onCancel } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return (): void => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const placement = useMemo(() => {
    if (typeof window === 'undefined') {
      return { top: position.bottom + 4, left: position.left };
    }
    const wouldOverflow = position.bottom + POPUP_HEIGHT_ESTIMATE > window.innerHeight;
    if (wouldOverflow && position.top - POPUP_HEIGHT_ESTIMATE > 0) {
      return { top: position.top - POPUP_HEIGHT_ESTIMATE - 4, left: position.left };
    }
    return { top: position.bottom + 4, left: position.left };
  }, [position.bottom, position.left, position.top]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Inserisci vista database"
      className="fixed z-50 w-72 rounded-md border border-border bg-bg-subtle shadow-lg"
      style={{ top: placement.top, left: placement.left }}
    >
      <div className="border-b border-border px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Database</div>
        <div className="mt-0.5 text-sm font-medium text-fg">Inserisci una vista salvata</div>
      </div>

      {error !== null && (
        <div role="alert" className="border-b border-border px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      <div role="listbox" aria-label="Viste database salvate" className="max-h-56 overflow-y-auto">
        {loading && <div className="px-3 py-2 text-xs text-fg-muted">Carico viste...</div>}
        {!loading && views.length === 0 && (
          <div className="px-3 py-2 text-xs text-fg-muted">Nessuna vista salvata.</div>
        )}
        {!loading &&
          views.map((view) => (
            <button
              key={view.id}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event): void => {
                event.preventDefault();
                onSelect(view.id);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-bg"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{view.name}</span>
                <span className="block truncate text-xs text-fg-muted">{view.layout}</span>
              </span>
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted">
                DB
              </span>
            </button>
          ))}
      </div>

      <div className="border-t border-border p-1">
        <button
          type="button"
          onMouseDown={(event): void => {
            event.preventDefault();
            onCreateQuick();
          }}
          className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-bg"
        >
          Nuova vista database
        </button>
      </div>
    </div>,
    document.body,
  );
}
