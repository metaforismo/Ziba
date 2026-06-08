import type { JSX } from 'react';
import { ConfirmDialog as UiConfirmDialog } from '../ui/Dialog';

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, styles the confirm button as destructive (red). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Reusable destructive-action confirmation modal. A thin shim over the
 * `ui/Dialog` ConfirmDialog primitive that keeps this call-site API (callers
 * conditionally render it rather than toggling an `open` prop). The Cancel
 * button gets default focus so an accidental Enter never triggers a delete;
 * focus-trap, Escape, backdrop dismissal and focus-return all live in the
 * primitive.
 */
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  return <UiConfirmDialog open {...props} />;
}
