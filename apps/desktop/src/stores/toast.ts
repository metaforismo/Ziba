// Global toast queue for non-blocking user feedback.
//
// Replaces `window.alert` across the renderer. The native dialog was
// the v0.1 placeholder: it's modal (blocks the whole window),
// platform-styled (looks foreign next to our UI), can't be unit-tested
// without monkey-patching, and stacks one-at-a-time.
//
// Design notes:
//   - Plain Zustand store, no provider needed. Both React components
//     (`useToastStore(s => s.toasts)`) and non-React callers
//     (`useToastStore.getState().push(...)`) use the same surface.
//   - IDs are monotonic counters so `<ToastStack>` can key reliably.
//     We don't use `crypto.randomUUID` to keep the store deterministic
//     in tests (no need to mock global randomness).
//   - Auto-dismiss is per-toast, scheduled inside `push` so the store
//     itself stays declarative (the timer drives `dismiss(id)`, which
//     is the same path manual close uses).

import { create } from 'zustand';

/**
 * Severity of a toast. Drives the visual treatment in `<ToastStack>`
 * (color, icon) and helps assistive tech announce the urgency.
 */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type Toast = {
  id: number;
  kind: ToastKind;
  /** Headline shown in bold; defaults to a kind-appropriate label when omitted. */
  title?: string;
  /** Body text. Required so a toast always has something to read. */
  message: string;
};

export type ToastInput = Omit<Toast, 'id'> & {
  /**
   * Override the default auto-dismiss window (ms). Pass `null` to
   * keep the toast visible until manually dismissed — useful for
   * persistent error states a user must acknowledge.
   */
  durationMs?: number | null;
};

type ToastState = {
  toasts: Toast[];
  push(toast: ToastInput): number;
  dismiss(id: number): void;
  clear(): void;
};

/**
 * Default auto-dismiss window. Long enough for a user to read a
 * one-line message at a glance, short enough not to pile up.
 */
const DEFAULT_DURATION_MS = 4000;

let nextId = 1;
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(input): number {
    const id = nextId++;
    const toast: Toast = {
      id,
      kind: input.kind,
      message: input.message,
      ...(input.title !== undefined ? { title: input.title } : {}),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));

    const duration = input.durationMs === undefined ? DEFAULT_DURATION_MS : input.durationMs;
    if (duration !== null) {
      const timer = setTimeout(() => {
        get().dismiss(id);
      }, duration);
      dismissTimers.set(id, timer);
    }
    return id;
  },
  dismiss(id): void {
    const timer = dismissTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      dismissTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear(): void {
    for (const timer of dismissTimers.values()) clearTimeout(timer);
    dismissTimers.clear();
    set({ toasts: [] });
  },
}));

/**
 * Convenience accessor for non-React callers (stores, async helpers,
 * IPC error handlers). Avoids the cost-and-rules of a hook in places
 * that aren't React components.
 */
function pushHelper(kind: ToastKind, message: string, title?: string): number {
  // `exactOptionalPropertyTypes` rejects `{ title: undefined }`, so we
  // omit the field entirely when no title was supplied.
  return useToastStore
    .getState()
    .push(title === undefined ? { kind, message } : { kind, message, title });
}

export const toast = {
  info(message: string, title?: string): number {
    return pushHelper('info', message, title);
  },
  success(message: string, title?: string): number {
    return pushHelper('success', message, title);
  },
  warning(message: string, title?: string): number {
    return pushHelper('warning', message, title);
  },
  error(message: string, title?: string): number {
    return pushHelper('error', message, title);
  },
};
