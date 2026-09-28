import { screenshotMaps } from "~/app/screenshot-maps";
import {
  applyEdits,
  fitImage,
  privateBoxes,
  type Rect,
  screenshotScale,
} from "~/core/feedback/redact";
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  type FeedbackImage,
  type FeedbackImageType,
} from "~/core/schema/feedback";

// Feedback screenshots (docs/FEEDBACK.md): the page as the person sees it,
// drawn with modern-screenshot (loaded here, on first use). Every
// `data-private` element (names, initials, other people's words, block
// labels) is hidden in the copy and painted over as a solid box on the
// image, so its pixels never exist. Our own sheet, tooltips and toasts are
// left out. WebGL maps read back blank, so each is asked for a frame first.

/** What marks the feedback sheet, the picker and the pins: never drawn. */
export const FEEDBACK_UI = "[data-feedback-ui]";

const LEFT_OUT = [
  FEEDBACK_UI,
  '[data-slot="tooltip-content"]',
  "[data-sonner-toaster]",
].join(",");

export const PRIVATE = "[data-private]";

/** A screenshot ready to send, with what the editor needs to redo it. */
export interface Shot {
  /** The image before any edits: the editor starts from this. */
  source: HTMLCanvasElement;
  blob: Blob;
  type: FeedbackImageType;
  width: number;
  height: number;
  /** For the thumbnail; revoke with `releaseShot`. */
  url: string;
  edited: boolean;
  /** "Choose an image instead". */
  fromFile: boolean;
}

export class ShotTooBigError extends Error {
  constructor() {
    super("Screenshot too big");
    this.name = "ShotTooBigError";
  }
}

function skipped(node: Node): boolean {
  return node instanceof Element && node.matches(LEFT_OUT);
}

/** The color of the boxes: the theme's faint ink, solid. */
function boxColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--faint")
    .trim();
  return value || "#8a8a8a";
}

function frameOf(map: ReturnType<typeof screenshotMaps>[number]) {
  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 1_000);
    map.once("render", () => {
      window.clearTimeout(timer);
      try {
        resolve(map.getCanvas().toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    });
    map.triggerRepaint();
  });
}

/** A flat "Map" box the size of `canvas`, for a map that won't give a frame. */
function flatMap(canvas: HTMLCanvasElement): string {
  const flat = document.createElement("canvas");
  flat.width = Math.max(1, canvas.width);
  flat.height = Math.max(1, canvas.height);
  const ctx = flat.getContext("2d");
  if (ctx) {
    ctx.fillStyle = boxColor();
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.fillStyle = getComputedStyle(document.body).color || "#000";
    ctx.font = `${Math.round(14 * (window.devicePixelRatio || 1))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Map", flat.width / 2, flat.height / 2);
  }
  return flat.toDataURL("image/png");
}

/**
 * Has each map's canvas answer `toDataURL` with a frame taken during a
 * render (or a flat box), which modern-screenshot copies. Returns the undo.
 */
async function freezeMaps(): Promise<() => void> {
  const frozen: HTMLCanvasElement[] = [];
  for (const map of screenshotMaps()) {
    const canvas = map.getCanvas();
    const frame = (await frameOf(map)) ?? flatMap(canvas);
    canvas.toDataURL = () => frame;
    frozen.push(canvas);
  }
  return () => {
    // The own property shadowed the prototype's; deleting restores it.
    for (const canvas of frozen)
      delete (canvas as { toDataURL?: unknown }).toDataURL;
  };
}

function privateRects(): Rect[] {
  return [...document.querySelectorAll(PRIVATE)]
    .filter((el) => !el.closest(LEFT_OUT))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
}

/**
 * The viewport as a canvas, private things boxed out, our own UI left out.
 * `scale` is the canvas's pixels per CSS pixel.
 */
export async function captureViewport(): Promise<{
  canvas: HTMLCanvasElement;
  scale: number;
}> {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const wanted = screenshotScale(viewport, window.devicePixelRatio);
  const [{ domToCanvas }, thaw] = await Promise.all([
    import("modern-screenshot"),
    freezeMaps(),
  ]);
  // Measured right before the copy: these are the boxes painted on top.
  const rects = privateRects();
  const { scrollX, scrollY } = window;
  let canvas: HTMLCanvasElement;
  try {
    canvas = await domToCanvas(document.body, {
      width: viewport.width,
      height: viewport.height,
      scale: wanted,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      filter: (node) => !skipped(node),
      features: { restoreScrollPosition: true },
      // The copy sits at the image's corner (no body margin), moved by the
      // window's own scroll: the copy starts at the page's top.
      style: {
        margin: "0",
        ...(scrollX || scrollY
          ? { transform: `translate(${-scrollX}px, ${-scrollY}px)` }
          : {}),
      },
      onCloneEachNode: (cloned) => {
        // Hidden in the copy as well as boxed on the image: belt and braces.
        // Opacity, since a child can't undo it the way it can visibility.
        if (cloned instanceof HTMLElement && cloned.matches(PRIVATE))
          cloned.style.opacity = "0";
      },
      timeout: 10_000,
    });
  } finally {
    thaw();
  }
  const scale = canvas.width / Math.max(1, viewport.width);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  ctx.fillStyle = boxColor();
  for (const box of privateBoxes(rects, viewport, scale))
    ctx.fillRect(box.x, box.y, box.width, box.height);
  return { canvas, scale };
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * WebP at 0.85 (0.7 if that's too big), or PNG where the browser can't
 * write WebP. Throws `ShotTooBigError` past the Worker's limit.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
): Promise<{ blob: Blob; type: FeedbackImageType }> {
  for (const quality of [0.85, 0.7]) {
    const webp = await toBlob(canvas, "image/webp", quality);
    // Safari hands back a PNG when asked for WebP.
    if (webp?.type !== "image/webp") break;
    if (webp.size <= FEEDBACK_IMAGE_MAX_BYTES)
      return { blob: webp, type: "image/webp" };
  }
  const png = await toBlob(canvas, "image/png");
  if (png && png.size <= FEEDBACK_IMAGE_MAX_BYTES)
    return { blob: png, type: "image/png" };
  throw new ShotTooBigError();
}

async function shotFrom(
  source: HTMLCanvasElement,
  image: HTMLCanvasElement,
  flags: { edited: boolean; fromFile: boolean },
): Promise<Shot> {
  const { blob, type } = await encodeCanvas(image);
  return {
    source,
    blob,
    type,
    width: image.width,
    height: image.height,
    url: URL.createObjectURL(blob),
    ...flags,
  };
}

/** A screenshot of the page as it is now. */
export async function takeScreenshot(): Promise<Shot> {
  const { canvas } = await captureViewport();
  return shotFrom(canvas, canvas, { edited: false, fromFile: false });
}

/**
 * "Choose an image instead": the file drawn onto a canvas and encoded
 * again, which leaves its metadata (EXIF, location) behind. Null when the
 * browser can't read it as an image.
 */
export async function shotFromFile(file: File): Promise<Shot | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  const size = fitImage({ width: bitmap.width, height: bitmap.height });
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return shotFrom(canvas, canvas, { edited: false, fromFile: true });
}

/** The editor's result: `source` cropped, with boxes painted over it. */
export async function editShot(
  shot: Shot,
  crop: Rect | null,
  boxes: readonly Rect[],
): Promise<Shot> {
  const edits = applyEdits(
    { width: shot.source.width, height: shot.source.height },
    crop,
    boxes,
  );
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(edits.crop.width));
  out.height = Math.max(1, Math.round(edits.crop.height));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  ctx.drawImage(
    shot.source,
    edits.crop.x,
    edits.crop.y,
    edits.crop.width,
    edits.crop.height,
    0,
    0,
    out.width,
    out.height,
  );
  ctx.fillStyle = "#000";
  for (const b of edits.boxes) ctx.fillRect(b.x, b.y, b.width, b.height);
  return shotFrom(shot.source, out, {
    edited: crop !== null || boxes.length > 0,
    fromFile: shot.fromFile,
  });
}

/** A crop of `canvas` as its own image (a pinned element's close-up). */
export async function cropToImage(
  canvas: HTMLCanvasElement,
  crop: Rect,
): Promise<FeedbackImage | undefined> {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(crop.width));
  out.height = Math.max(1, Math.round(crop.height));
  out
    .getContext("2d")
    ?.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      out.width,
      out.height,
    );
  try {
    const { blob, type } = await encodeCanvas(out);
    return { type, data: await base64Of(blob) };
  } catch {
    return undefined;
  }
}

export function releaseShot(shot: Shot | null): void {
  if (shot) URL.revokeObjectURL(shot.url);
}

/** A blob's bytes as base64, for the JSON body. */
export function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The editor's canvas: the image, its boxes in solid black, and the crop
 * (or the one being dragged) with everything outside it dimmed.
 */
export function paintEdits(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
  crop: Rect | null,
  boxes: readonly Rect[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = "#000";
  for (const b of boxes) ctx.fillRect(b.x, b.y, b.width, b.height);
  if (!crop) return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  const { width, height } = canvas;
  ctx.fillRect(0, 0, width, crop.y);
  ctx.fillRect(0, crop.y + crop.height, width, height - crop.y - crop.height);
  ctx.fillRect(0, crop.y, crop.x, crop.height);
  ctx.fillRect(
    crop.x + crop.width,
    crop.y,
    width - crop.x - crop.width,
    crop.height,
  );
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(2, width / 600);
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
  ctx.setLineDash([]);
}
