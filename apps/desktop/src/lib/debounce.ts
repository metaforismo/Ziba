/**
 * Trailing-edge debounce. Returns a wrapper that schedules `fn` after `ms`
 * idle milliseconds. The most recent arguments win — earlier calls are
 * dropped. `cancel()` aborts any pending call; `flush()` invokes it now if
 * one is pending.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): T & { cancel(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const wrapped = ((...args: Parameters<T>): void => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = pendingArgs;
      pendingArgs = null;
      if (a !== null) fn(...a);
    }, ms);
  }) as T & { cancel(): void; flush(): void };

  wrapped.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  wrapped.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const a = pendingArgs;
    pendingArgs = null;
    if (a !== null) fn(...a);
  };

  return wrapped;
}
