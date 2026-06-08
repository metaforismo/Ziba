import { useCallback, useEffect, useRef } from 'react';
import type { CanvasHandle, CanvasView } from '../components/GlobalGraph/Canvas';
import { GRAPH_CAMERA_TWEEN_MS } from './graph-tuning';

/** True when the user has asked the OS to minimise non-essential motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ease-in-out cubic — gentle acceleration and deceleration for the glide. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

type AnimateOptions = {
  /** Disable the tween (instant jump) — e.g. above the large-graph threshold. */
  instant?: boolean;
  durationMs?: number;
};

/**
 * RAF-driven camera tween for the global graph. Returns an `animateTo`
 * that glides the Canvas's imperative view from its current transform to
 * `target`, and a `cancel` to stop any in-flight glide.
 *
 * Design notes:
 *   - We drive the Canvas via its imperative `setView` so we DON'T
 *     re-render React (or re-run the d3-force settle) per frame — this is
 *     a pure camera tween, never a physics loop.
 *   - `prefers-reduced-motion` ⇒ instant jump, no RAF.
 *   - A new `animateTo` cancels the previous one (no overlap/jank).
 *   - `onSettle(view)` fires once with the final transform so the caller
 *     can sync React state (mirrors the manual pan/zoom settle path).
 */
export function useCameraTween(
  canvasRef: React.MutableRefObject<CanvasHandle | null>,
  onSettle: (view: CanvasView) => void,
): { animateTo: (target: CanvasView, options?: AnimateOptions) => void; cancel: () => void } {
  const rafRef = useRef<number | null>(null);
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  const cancel = useCallback((): void => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const animateTo = useCallback(
    (target: CanvasView, options?: AnimateOptions): void => {
      const handle = canvasRef.current;
      if (handle === null) return;
      // Always cancel an in-flight tween first so two selections in quick
      // succession don't fight over the transform.
      cancel();

      const start = handle.getView();
      const duration = options?.durationMs ?? GRAPH_CAMERA_TWEEN_MS;

      if (options?.instant === true || prefersReducedMotion() || duration <= 0) {
        handle.setView(target);
        onSettleRef.current(target);
        return;
      }

      const startTime = performance.now();
      const step = (now: number): void => {
        const live = canvasRef.current;
        if (live === null) {
          rafRef.current = null;
          return;
        }
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const e = easeInOutCubic(t);
        const view: CanvasView = {
          tx: lerp(start.tx, target.tx, e),
          ty: lerp(start.ty, target.ty, e),
          scale: lerp(start.scale, target.scale, e),
        };
        live.setView(view);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
          onSettleRef.current(target);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [canvasRef, cancel],
  );

  // Stop any pending frame on unmount.
  useEffect(() => cancel, [cancel]);

  return { animateTo, cancel };
}
