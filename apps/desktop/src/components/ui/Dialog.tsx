import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export type DialogProps = {
  open: boolean;
  /** Called on Escape, backdrop click, or the close affordance. */
  onClose: () => void;
  /**
   * Dialog heading. When provided it is wired to `aria-labelledby`; pass a
   * string for the common case or a node for richer markup.
   */
  title?: ReactNode;
  /**
   * Supporting copy under the title. When provided it is wired to
   * `aria-describedby`.
   */
  description?: ReactNode;
  /** Main body content (form fields, extra paragraphs, …). */
  children?: ReactNode;
  /** Footer region, typically the action buttons. Right-aligned by default. */
  footer?: ReactNode;
  /**
   * `dialog` (default) or `alertdialog` for destructive confirmations that
   * interrupt the user and should not be dismissed by incidental input.
   */
  role?: 'dialog' | 'alertdialog';
  /**
   * Element to focus when the dialog opens. Defaults to the first focusable
   * element in the panel. Pass e.g. a Cancel button ref so an accidental
   * Enter never fires the destructive action.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Restore focus to this element on close. Defaults to whatever had focus
   * when the dialog opened (WAI-ARIA: focus returns to the trigger).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible label when no visible `title` is rendered. */
  ariaLabel?: string;
  /** Extra classes merged onto the panel (width overrides etc.). */
  className?: string;
};

// Selector for the tabbables we cycle through inside the focus trap. Mirrors
// the common WAI-ARIA dialog implementations: actionable elements that are
// not explicitly removed from the tab order.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    // Skip nodes hidden from the a11y tree. We deliberately avoid an
    // `offsetParent`/layout check: it's `null` for everything under jsdom (no
    // layout engine) and our dialogs never `display:none` their controls, so
    // the attribute checks below are both sufficient and test-friendly.
    if (el.hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

/**
 * Modal dialog primitive. Owns the backdrop, centred panel, portal, scroll
 * lock, focus trap, Escape-to-close, backdrop-click dismissal, focus return
 * to the trigger, and the `role`/`aria-modal`/`aria-labelledby`/
 * `aria-describedby` wiring. Token-based and `prefers-reduced-motion` aware
 * (the fade is dropped via `motion-reduce`).
 *
 * Composition is via `title` / `description` / `children` / `footer` slots so
 * the common confirm/prompt shapes stay one literal block, while `children`
 * still allows arbitrary body content (e.g. the prompt's text input).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  initialFocusRef,
  returnFocusRef,
  ariaLabel,
  className,
}: DialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();
  // Element focused when the dialog opened, so we can restore it on close.
  const returnTargetRef = useRef<HTMLElement | null>(null);

  // Latch the latest onClose so the keydown/scroll-lock effects don't tear
  // down and re-add listeners on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Capture the prior focus target on open and move focus into the panel.
  useEffect(() => {
    if (!open) return undefined;
    returnTargetRef.current =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    // Defer so the panel is mounted before we reach into it.
    const id = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel === null) return;
      const explicit = initialFocusRef?.current;
      if (explicit !== null && explicit !== undefined) {
        explicit.focus();
        return;
      }
      const [first] = focusableWithin(panel);
      // Fall back to the panel itself (tabIndex=-1) so focus is never left on
      // a now-inert background element.
      (first ?? panel).focus();
    });
    return (): void => window.cancelAnimationFrame(id);
    // initialFocusRef/returnFocusRef are refs; only `open` should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Restore focus to the trigger when the dialog closes/unmounts. Guard
  // against a detached node (e.g. the row that opened it was deleted).
  useEffect(() => {
    if (!open) return undefined;
    return (): void => {
      const target = returnTargetRef.current;
      if (target !== null && document.contains(target)) target.focus();
    };
  }, [open]);

  // Escape to close + Tab focus trap. Kept in one keydown listener on the
  // panel so it only fires while the dialog owns focus.
  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (panel === null) return;
    const focusables = focusableWithin(panel);
    if (focusables.length === 0) {
      // Nothing tabbable — keep focus pinned on the panel.
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    // Wrap around the ends so Tab/Shift+Tab cycle within the dialog.
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Lock body scroll while open so the page behind the modal doesn't move.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return (): void => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const hasTitle = title !== undefined && title !== null;
  const hasDescription = description !== undefined && description !== null;

  return createPortal(
    <div
      className="ziba-dialog-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e): void => {
        // Click on the backdrop cancels; clicks inside the panel stop here.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={hasTitle ? undefined : ariaLabel}
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-describedby={hasDescription ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={[
          'ziba-dialog-panel-in w-full max-w-sm rounded-lg border border-border bg-bg p-4 shadow-lg outline-none',
          className ?? '',
        ]
          .join(' ')
          .trim()}
      >
        {hasTitle && (
          <h2 id={titleId} className="mb-2 text-sm font-semibold text-fg">
            {title}
          </h2>
        )}
        {hasDescription && (
          <p id={descId} className="mb-4 text-sm text-fg-subtle">
            {description}
          </p>
        )}
        {children}
        {footer !== undefined && footer !== null && (
          <div className="mt-4 flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmDialogBaseProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) and uses `alertdialog`. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Thin confirm/cancel wrapper over `Dialog`. Cancel takes default focus so an
 * accidental Enter never triggers a destructive action. Destructive confirms
 * render an `alertdialog` with a red confirm button.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogBaseProps): JSX.Element | null {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      role={destructive ? 'alertdialog' : 'dialog'}
      title={title}
      description={message}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {/* Destructive confirms read red; benign ones use the accent fill. */}
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
