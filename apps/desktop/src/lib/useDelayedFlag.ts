import { useEffect, useRef, useState } from 'react';

/**
 * Min-display delay for skeleton/loading UI.
 *
 * Returns `true` only once `active` has stayed truthy for `delayMs` —
 * so a fast load (resolved before the delay) never flashes a skeleton.
 * Slow loads still surface progress: once shown, the flag tracks `active`
 * directly and hides immediately when work finishes.
 *
 * Kept intentionally local and dependency-free; callers pass their own
 * loading flag in.
 */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [shown, setShown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (active) {
      // Arm a one-shot timer; if `active` clears first, the cleanup below
      // cancels it and the skeleton is never shown.
      timerRef.current = setTimeout(() => setShown(true), delayMs);
      return () => {
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    // Work finished — hide immediately. No reason to keep a placeholder
    // up once real content is ready.
    setShown(false);
    return undefined;
  }, [active, delayMs]);

  return shown;
}
