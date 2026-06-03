import type { CanvasView } from './Canvas';

type GraphKeyboardEvent = {
  key: string;
  shiftKey?: boolean;
};

type KeyboardViewOptions = {
  width?: number;
  height?: number;
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  panStep?: number;
  fastPanStep?: number;
};

const DEFAULT_WIDTH = 1400;
const DEFAULT_HEIGHT = 900;
const DEFAULT_MIN_SCALE = 0.35;
const DEFAULT_MAX_SCALE = 4;
const DEFAULT_ZOOM_STEP = 1.25;
const DEFAULT_PAN_STEP = 64;
const DEFAULT_FAST_PAN_STEP = 192;

export function nextGraphKeyboardView(
  view: CanvasView,
  event: GraphKeyboardEvent,
  options: KeyboardViewOptions = {},
): CanvasView | null {
  const panStep = event.shiftKey
    ? (options.fastPanStep ?? DEFAULT_FAST_PAN_STEP)
    : (options.panStep ?? DEFAULT_PAN_STEP);

  if (event.key === 'ArrowLeft') return { ...view, tx: view.tx - panStep };
  if (event.key === 'ArrowRight') return { ...view, tx: view.tx + panStep };
  if (event.key === 'ArrowUp') return { ...view, ty: view.ty - panStep };
  if (event.key === 'ArrowDown') return { ...view, ty: view.ty + panStep };

  if (event.key === '+' || event.key === '=') {
    return zoomAroundCenter(view, options.zoomStep ?? DEFAULT_ZOOM_STEP, options);
  }

  if (event.key === '-' || event.key === '_') {
    return zoomAroundCenter(view, 1 / (options.zoomStep ?? DEFAULT_ZOOM_STEP), options);
  }

  return null;
}

function zoomAroundCenter(
  view: CanvasView,
  factor: number,
  options: KeyboardViewOptions,
): CanvasView {
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const nextScale = clamp(view.scale * factor, minScale, maxScale);
  if (nextScale === view.scale) return view;

  const cx = (options.width ?? DEFAULT_WIDTH) / 2;
  const cy = (options.height ?? DEFAULT_HEIGHT) / 2;
  const ratio = nextScale / view.scale;
  return {
    tx: cx - (cx - view.tx) * ratio,
    ty: cy - (cy - view.ty) * ratio,
    scale: nextScale,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
