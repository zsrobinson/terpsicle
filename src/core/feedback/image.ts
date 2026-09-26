import type { FeedbackImageType } from "../schema/feedback";

// What a feedback image really is, from its first bytes: the Worker stores a
// screenshot only when its bytes match the type it was sent as and its size
// is sane, so nothing else (HTML, SVG, a script) ever lands in R2 under an
// image's name.

export interface SniffedImage {
  type: FeedbackImageType;
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) =>
  ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) =>
  (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) =>
  (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) =>
  (((b[i] ?? 0) << 24) >>> 0) +
  (((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0));

const ascii = (b: Uint8Array, i: number, text: string) =>
  [...text].every((c, j) => b[i + j] === c.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(b: Uint8Array): SniffedImage | null {
  if (!PNG_SIGNATURE.every((v, i) => b[i] === v)) return null;
  // The first chunk is always IHDR: width and height, big-endian.
  if (!ascii(b, 12, "IHDR")) return null;
  return { type: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

function webp(b: Uint8Array): SniffedImage | null {
  if (!ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) return null;
  if (ascii(b, 12, "VP8 ")) {
    // Lossy: a keyframe's start code, then 14-bit width and height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      type: "image/webp",
      width: u16le(b, 26) & 0x3fff,
      height: u16le(b, 28) & 0x3fff,
    };
  }
  if (ascii(b, 12, "VP8L")) {
    // Lossless: a 0x2f signature, then 14-bit width-1 and height-1.
    if (b[20] !== 0x2f) return null;
    const bits =
      (b[21] ?? 0) |
      ((b[22] ?? 0) << 8) |
      ((b[23] ?? 0) << 16) |
      ((b[24] ?? 0) << 24);
    return {
      type: "image/webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  if (ascii(b, 12, "VP8X")) {
    // Extended: 24-bit canvas width-1 and height-1.
    return {
      type: "image/webp",
      width: u24le(b, 24) + 1,
      height: u24le(b, 27) + 1,
    };
  }
  return null;
}

/** Start-of-frame markers that carry a JPEG's size (not DHT, JPG or DAC). */
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpeg(b: Uint8Array): SniffedImage | null {
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  // Walk the segments to the first start of frame.
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(b, i + 2);
    if (SOF.has(marker))
      return {
        type: "image/jpeg",
        width: u16be(b, i + 7),
        height: u16be(b, i + 5),
      };
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** The image's real type and size, or null when it's none of ours. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  return png(bytes) ?? webp(bytes) ?? jpeg(bytes);
}

/**
 * Whether `bytes` are a `type` image no larger than `maxSide` on either
 * side, and not empty.
 */
export function checkImage(
  bytes: Uint8Array,
  type: FeedbackImageType,
  maxSide: number,
): SniffedImage | null {
  const found = sniffImage(bytes);
  if (!found || found.type !== type) return null;
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= maxSide;
  return ok(found.width) && ok(found.height) ? found : null;
}

/** Base64 to bytes, or null for anything that isn't base64. */
export function decodeBase64(data: string): Uint8Array | null {
  try {
    const text = atob(data);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The file extension R2 keys use for each type. */
export const IMAGE_EXTENSIONS: Readonly<Record<FeedbackImageType, string>> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
};
