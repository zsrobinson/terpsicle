import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cacheControlFor,
  isContentHashedKey,
  POINTER_MAX_AGE_SECONDS,
} from "./cache-policy";

describe("cacheControlFor", () => {
  it.each([
    "manifest.json",
    "catalog/terms.json",
    "seats.json",
    "seats-latest.json",
    "geo/route/MCK-IRB-standard.json",
  ])("revalidates pointer file %s after a minute", (key) => {
    expect(cacheControlFor(key)).toBe(
      `public, max-age=${POINTER_MAX_AGE_SECONDS}`,
    );
  });

  it.each([
    "catalog/cmsc.3f9a1c0b.json",
    "seats.0123456789abcdef.json",
    "geo/routes.deadbeef.bin",
  ])("marks content-hashed file %s immutable", (key) => {
    expect(cacheControlFor(key)).toContain("immutable");
  });

  it("does not treat short or non-hex suffixes as hashes", () => {
    expect(isContentHashedKey("catalog/cmsc.3f9a1c0.json")).toBe(false);
    expect(isContentHashedKey("catalog/cmsc.3F9A1C0B.json")).toBe(false);
    expect(isContentHashedKey("catalog/cmsc.zzzzzzzz.json")).toBe(false);
    expect(isContentHashedKey("catalog/cmsc.3f9a1c0b.txt")).toBe(false);
  });

  it("marks any name with an 8+ char hex hash immutable", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9/_-]{1,40}$/),
        fc.stringMatching(/^[0-9a-f]{8,64}$/),
        fc.constantFrom("json", "bin"),
        (name, hash, ext) =>
          cacheControlFor(`${name}.${hash}.${ext}`).endsWith("immutable"),
      ),
    );
  });
});
