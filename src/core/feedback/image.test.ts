import { describe, expect, it } from "vitest";
import { checkImage, decodeBase64, sniffImage } from "./image";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p,
    ),
  );

const be32 = (n: number) => [
  n >>> 24,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const le16 = (n: number) => [n & 255, n >>> 8];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, n >>> 16];

/** A PNG's signature and IHDR, which is all the sniffer reads. */
const pngHead = (w: number, h: number) =>
  bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    "IHDR",
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
  );

const webpLossy = (w: number, h: number) =>
  bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8 ",
    [0, 0, 0, 0],
    [0, 0, 0],
    [0x9d, 0x01, 0x2a],
    le16(w),
    le16(h),
  );

const webpLossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8L",
    [0, 0, 0, 0],
    [0x2f],
    [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, bits >>> 24],
  );
};

const webpExtended = (w: number, h: number) =>
  bytes(
    "RIFF",
    [0, 0, 0, 0],
    "WEBP",
    "VP8X",
    [10, 0, 0, 0],
    [0, 0, 0, 0],
    le24(w - 1),
    le24(h - 1),
  );

/** SOI, an APP0 segment, then a baseline SOF0 with the size. */
const jpegHead = (w: number, h: number) =>
  bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, 0, 16],
    "JFIF",
    [0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xc0, 0, 17, 8, h >>> 8, h & 255, w >>> 8, w & 255, 3],
  );

describe("sniffImage", () => {
  it("reads a PNG's size from IHDR", () => {
    expect(sniffImage(pngHead(1280, 800))).toEqual({
      type: "image/png",
      width: 1280,
      height: 800,
    });
  });

  it("reads lossy, lossless and extended WebP sizes", () => {
    expect(sniffImage(webpLossy(640, 480))).toEqual({
      type: "image/webp",
      width: 640,
      height: 480,
    });
    expect(sniffImage(webpLossless(2560, 1600))).toEqual({
      type: "image/webp",
      width: 2560,
      height: 1600,
    });
    expect(sniffImage(webpExtended(3000, 7))).toEqual({
      type: "image/webp",
      width: 3000,
      height: 7,
    });
  });

  it("walks a JPEG's segments to its start of frame", () => {
    expect(sniffImage(jpegHead(1024, 768))).toEqual({
      type: "image/jpeg",
      width: 1024,
      height: 768,
    });
  });

  it("knows nothing else", () => {
    expect(
      sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'>")),
    ).toBeNull();
    expect(sniffImage(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffImage(bytes("GIF89a", [1, 0, 1, 0]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBeNull();
  });
});

describe("checkImage", () => {
  it("wants the type it was sent as", () => {
    expect(checkImage(pngHead(10, 10), "image/png", 4096)).not.toBeNull();
    expect(checkImage(pngHead(10, 10), "image/webp", 4096)).toBeNull();
  });

  it("refuses empty and oversized images", () => {
    expect(checkImage(pngHead(0, 10), "image/png", 4096)).toBeNull();
    expect(checkImage(pngHead(4097, 10), "image/png", 4096)).toBeNull();
    expect(checkImage(pngHead(10, 100_000), "image/png", 4096)).toBeNull();
    expect(checkImage(pngHead(4096, 4096), "image/png", 4096)).not.toBeNull();
  });
});

describe("decodeBase64", () => {
  it("decodes base64 and refuses anything else", () => {
    expect(decodeBase64("aGk=")).toEqual(bytes("hi"));
    expect(decodeBase64("not base64!")).toBeNull();
  });
});
