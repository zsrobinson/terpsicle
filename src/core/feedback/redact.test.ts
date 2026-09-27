import { describe, expect, it } from "vitest";
import {
  applyEdits,
  clampRect,
  elementCrop,
  fitImage,
  isUsableBox,
  outwardRect,
  privateBoxes,
  rectFrom,
  screenshotScale,
  toImagePoint,
} from "./redact";

describe("screenshotScale", () => {
  it("follows the pixel ratio, at most 2", () => {
    expect(screenshotScale({ width: 390, height: 844 }, 3)).toBe(2);
    expect(screenshotScale({ width: 1280, height: 800 }, 1)).toBe(1);
    expect(screenshotScale({ width: 1280, height: 800 }, 1.5)).toBe(1.5);
  });

  it("keeps the image at most 2,560 wide", () => {
    expect(screenshotScale({ width: 1920, height: 1080 }, 2)).toBeCloseTo(
      2560 / 1920,
    );
    expect(screenshotScale({ width: 3000, height: 1000 }, 1)).toBeCloseTo(
      2560 / 3000,
    );
  });

  it("keeps a very tall window under the Worker's limit", () => {
    expect(screenshotScale({ width: 400, height: 4000 }, 2)).toBeCloseTo(
      4096 / 4000,
    );
  });

  it("treats a missing ratio as 1", () => {
    expect(screenshotScale({ width: 800, height: 600 }, 0)).toBe(1);
    expect(screenshotScale({ width: 800, height: 600 }, Number.NaN)).toBe(1);
  });
});

describe("rectFrom", () => {
  it("spans two points from any corner", () => {
    expect(rectFrom({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({
      x: 4,
      y: 5,
      width: 6,
      height: 15,
    });
  });
});

describe("clampRect and outwardRect", () => {
  it("keeps the part inside", () => {
    expect(
      clampRect(
        { x: -5, y: 10, width: 20, height: 100 },
        { width: 50, height: 50 },
      ),
    ).toEqual({ x: 0, y: 10, width: 15, height: 40 });
    expect(
      clampRect(
        { x: 60, y: 0, width: 5, height: 5 },
        { width: 50, height: 50 },
      ),
    ).toMatchObject({ width: 0 });
  });

  it("grows to whole pixels", () => {
    expect(outwardRect({ x: 1.4, y: 2.6, width: 3.2, height: 1 }, 1)).toEqual({
      x: 0,
      y: 1,
      width: 6,
      height: 4,
    });
  });
});

describe("privateBoxes", () => {
  const viewport = { width: 100, height: 50 };

  it("scales, pads a pixel and clamps each box", () => {
    expect(
      privateBoxes([{ x: 10, y: 10, width: 20, height: 5 }], viewport, 2),
    ).toEqual([{ x: 19, y: 19, width: 42, height: 12 }]);
    expect(
      privateBoxes([{ x: 90, y: 40, width: 50, height: 50 }], viewport, 1),
    ).toEqual([{ x: 89, y: 39, width: 11, height: 11 }]);
  });

  it("leaves out what's off screen or empty", () => {
    expect(
      privateBoxes(
        [
          { x: 0, y: 200, width: 10, height: 10 },
          { x: 5, y: 5, width: 0, height: 10 },
        ],
        viewport,
        1,
      ),
    ).toEqual([]);
  });
});

describe("toImagePoint", () => {
  it("maps the shown canvas to the image's pixels", () => {
    expect(
      toImagePoint(
        { x: 50, y: 25 },
        { width: 100, height: 50 },
        { width: 400, height: 200 },
      ),
    ).toEqual({ x: 200, y: 100 });
    expect(
      toImagePoint(
        { x: -5, y: 90 },
        { width: 100, height: 50 },
        { width: 400, height: 200 },
      ),
    ).toEqual({ x: 0, y: 200 });
  });
});

describe("isUsableBox", () => {
  it("ignores a stray click", () => {
    expect(isUsableBox({ x: 0, y: 0, width: 2, height: 40 })).toBe(false);
    expect(isUsableBox({ x: 0, y: 0, width: 4, height: 4 })).toBe(true);
  });
});

describe("elementCrop", () => {
  it("adds room around the element, inside the image", () => {
    expect(
      elementCrop(
        { x: 5, y: 10, width: 20, height: 10 },
        { width: 100, height: 100 },
        2,
        4,
      ),
    ).toEqual({ x: 2, y: 12, width: 56, height: 36 });
  });

  it("is null off screen", () => {
    expect(
      elementCrop(
        { x: 0, y: 500, width: 10, height: 10 },
        { width: 100, height: 100 },
        1,
      ),
    ).toBeNull();
  });
});

describe("applyEdits", () => {
  const image = { width: 200, height: 100 };

  it("moves boxes into the crop and clips them", () => {
    expect(
      applyEdits(image, { x: 50, y: 20, width: 100, height: 60 }, [
        { x: 40, y: 30, width: 30, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
      ]),
    ).toEqual({
      crop: { x: 50, y: 20, width: 100, height: 60 },
      boxes: [{ x: 0, y: 10, width: 20, height: 10 }],
    });
  });

  it("keeps the whole image without a usable crop", () => {
    expect(
      applyEdits(image, { x: 0, y: 0, width: 1, height: 1 }, []).crop,
    ).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});

describe("fitImage", () => {
  it("shrinks a big image to fit, keeping its shape", () => {
    expect(fitImage({ width: 5120, height: 2880 })).toEqual({
      width: 2560,
      height: 1440,
    });
    expect(fitImage({ width: 1000, height: 8192 })).toEqual({
      width: 500,
      height: 4096,
    });
  });

  it("never enlarges", () => {
    expect(fitImage({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });
});
