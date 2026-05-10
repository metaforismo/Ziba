import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useToastStore, type ToastKind } from './toast';

// The toast store powers all user-facing error/success surfaces (sidebar
// CRUD, navigation failures, future plugin events). The interface is
// tiny but a few invariants are load-bearing:
//   - id allocation is monotonic so React keys stay stable;
//   - auto-dismiss must not fire after a manual dismiss (no "ghost"
//     ID tries to remove a toast a different push later inserts at the
//     same id, mid-runtime);
//   - clear() must cancel pending timers (otherwise tests bleed
//     across each other and prod sees odd flicker on vault switch).

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clear();
});

afterEach(() => {
  useToastStore.getState().clear();
  vi.useRealTimers();
});

describe('useToastStore — push / dismiss', () => {
  it('appends a toast with a fresh id', () => {
    const id1 = useToastStore.getState().push({ kind: 'info', message: 'a' });
    const id2 = useToastStore.getState().push({ kind: 'info', message: 'b' });
    expect(id2).toBeGreaterThan(id1);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(2);
    expect(toasts[0]!.message).toBe('a');
    expect(toasts[1]!.message).toBe('b');
  });

  it('preserves the optional title and kind in the stored toast', () => {
    useToastStore.getState().push({ kind: 'error', message: 'boom', title: 'Errore IPC' });
    const t = useToastStore.getState().toasts[0]!;
    expect(t.kind).toBe('error');
    expect(t.title).toBe('Errore IPC');
  });

  it('dismiss(id) removes the matching toast and is a no-op for unknown ids', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'a' });
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toEqual([]);
    // Unknown id — should not throw.
    useToastStore.getState().dismiss(99999);
  });
});

describe('useToastStore — auto-dismiss', () => {
  it('auto-dismisses after the default 4s window', () => {
    useToastStore.getState().push({ kind: 'info', message: 'a' });
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('respects a custom durationMs', () => {
    useToastStore.getState().push({ kind: 'info', message: 'a', durationMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('keeps the toast visible indefinitely when durationMs is null', () => {
    useToastStore.getState().push({ kind: 'error', message: 'persistent', durationMs: null });
    vi.advanceTimersByTime(60_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('manual dismiss before the timer cancels the timer (no double-remove)', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'a' });
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    // The pending auto-dismiss timer must not later try to remove a
    // *different* toast that happens to inherit `id` (we don't recycle
    // ids, but the timer must be cleared to avoid runtime warnings).
    vi.advanceTimersByTime(10_000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('clear() removes everything and cancels pending timers', () => {
    useToastStore.getState().push({ kind: 'info', message: 'a' });
    useToastStore.getState().push({ kind: 'info', message: 'b' });
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toEqual([]);
    // Even after the original auto-dismiss window, no further state
    // change should occur (no errors logged, no zombie removals).
    vi.advanceTimersByTime(10_000);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('toast convenience helpers', () => {
  it.each([
    ['info', 'info'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'error'],
  ] as const)('toast.%s pushes a toast with kind=%s', (helper, expectedKind: ToastKind) => {
    toast[helper]('msg', 'My title');
    const t = useToastStore.getState().toasts[0]!;
    expect(t.kind).toBe(expectedKind);
    expect(t.message).toBe('msg');
    expect(t.title).toBe('My title');
  });
});
