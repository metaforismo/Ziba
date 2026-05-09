import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

// `debounce` is small but load-bearing — every store and several
// components rely on its trailing-edge contract. Fake timers make the
// timing-sensitive cases deterministic and fast.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('invokes once after the delay elapses', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid calls — latest args win', () => {
    const fn = vi.fn<(...args: number[]) => void>();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  it('cancel() prevents the pending call from firing', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes immediately with the latest args', () => {
    const fn = vi.fn<(...args: number[]) => void>();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    // After flush, the pending timer is cleared — running the clock
    // forward doesn't fire a second time.
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() with nothing pending is a safe no-op', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('a fresh call after a fired one debounces independently', () => {
    const fn = vi.fn<(...args: number[]) => void>();
    const d = debounce(fn, 100);
    d(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    d(2);
    expect(fn).toHaveBeenCalledTimes(1); // not yet
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });
});
