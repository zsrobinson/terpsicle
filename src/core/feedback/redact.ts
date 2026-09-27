// The screenshot's geometry (docs/FEEDBACK.md): how big it's drawn, which
// boxes cover private things, and the redact and crop editor's rectangles.
// Pure numbers, so the canvas code stays a thin painter.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The widest screenshot we send, in pixels. */
export const SCREENSHOT_MAX_WIDTH = 2_560;
/** The tallest image the Worker takes (`FEEDBACK_IMAGE_MAX_SIDE`). */
export const SCREENSHOT_MAX_HEIGHT = 4_096;
/** Retina detail without doubling a 3x phone's pixels again. */
export const SCREENSHOT_MAX_SCALE = 2;
/** Boxes smaller than this, in image pixels, are a stray click. */
export const MIN_BOX = 4;

/**
 * The capture's scale and size for a viewport: the device's pixel ratio,
 * at most 2, and never wider than `SCREENSHOT_MAX_WIDTH`.
 */
export function screenshotScale(viewport: Size, dpr: number): number {
  const byWidth =
    viewport.width > 0 ? SCREENSHOT_MAX_WIDTH / viewport.width : 1;
  const byHeight =
    viewport.height > 0 ? SCREENSHOT_MAX_HEIGHT / viewport.height : 1;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(ratio, SCREENSHOT_MAX_SCALE, byWidth, byHeight);
}

/**
 * A chosen image's size once it fits: at most `SCREENSHOT_MAX_WIDTH` wide
 * and `SCREENSHOT_MAX_HEIGHT` tall, never enlarged, whole pixels.
 */
export function fitImage(size: Size): Size {
  const factor = Math.min(
    1,
    SCREENSHOT_MAX_WIDTH / Math.max(1, size.width),
    SCREENSHOT_MAX_HEIGHT / Math.max(1, size.height),
  );
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
  };
}

/** The rectangle two drag points span, from whichever corner. */
export function rectFrom(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** The part of `rect` inside `bounds` (0 wide or tall when outside). */
export function clampRect(rect: Rect, bounds: Size): Rect {
  const x = Math.min(Math.max(rect.x, 0), bounds.width);
  const y = Math.min(Math.max(rect.y, 0), bounds.height);
  const right = Math.min(Math.max(rect.x + rect.width, 0), bounds.width);
  const bottom = Math.min(Math.max(rect.y + rect.height, 0), bounds.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** A rect grown to whole pixels on every side, so no edge pixel leaks. */
export function outwardRect(rect: Rect, pad = 0): Rect {
  const x = Math.floor(rect.x - pad);
  const y = Math.floor(rect.y - pad);
  return {
    x,
    y,
    width: Math.ceil(rect.x + rect.width + pad) - x,
    height: Math.ceil(rect.y + rect.height + pad) - y,
  };
}

/** `rect` in CSS pixels to image pixels at `scale`. */
export function scaleRect(rect: Rect, scale: number): Rect {
  return {
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/**
 * The boxes that cover private elements in the image: each element's
 * viewport rect, scaled, grown a pixel all round and clamped to the image.
 * Elements off screen or with no size are left out.
 */
export function privateBoxes(
  rects: readonly Rect[],
  viewport: Size,
  scale: number,
): Rect[] {
  const image = {
    width: Math.round(viewport.width * scale),
    height: Math.round(viewport.height * scale),
  };
  return rects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => clampRect(outwardRect(scaleRect(r, scale), 1), image))
    .filter((r) => r.width > 0 && r.height > 0);
}

/**
 * A point on the editor's canvas as shown (CSS pixels at `shown` size) in
 * the image's own pixels.
 */
export function toImagePoint(point: Point, shown: Size, image: Size): Point {
  const sx = shown.width > 0 ? image.width / shown.width : 1;
  const sy = shown.height > 0 ? image.height / shown.height : 1;
  return {
    x: Math.min(Math.max(point.x * sx, 0), image.width),
    y: Math.min(Math.max(point.y * sy, 0), image.height),
  };
}

/** Whether a drawn box is big enough to mean something. */
export function isUsableBox(rect: Rect): boolean {
  return rect.width >= MIN_BOX && rect.height >= MIN_BOX;
}

/**
 * The crop for a pinned element: its rect with some room around it, in
 * image pixels, inside the image. Null when it's off screen.
 */
export function elementCrop(
  rect: Rect,
  viewport: Size,
  scale: number,
  pad = 12,
): Rect | null {
  const image = {
    width: Math.round(viewport.width * scale),
    height: Math.round(viewport.height * scale),
  };
  const crop = clampRect(
    outwardRect(scaleRect(rect, scale), pad * scale),
    image,
  );
  return crop.width >= 1 && crop.height >= 1 ? crop : null;
}

/**
 * An image after the editor's crop and boxes: the crop (or the whole
 * image) and the boxes moved into its coordinates, clipped to it.
 */
export function applyEdits(
  image: Size,
  crop: Rect | null,
  boxes: readonly Rect[],
): { crop: Rect; boxes: Rect[] } {
  const whole = { x: 0, y: 0, ...image };
  const area = crop && isUsableBox(crop) ? clampRect(crop, image) : whole;
  const moved = boxes
    .map((b) =>
      clampRect(
        { x: b.x - area.x, y: b.y - area.y, width: b.width, height: b.height },
        area,
      ),
    )
    .filter((b) => b.width > 0 && b.height > 0);
  return { crop: area, boxes: moved };
}
