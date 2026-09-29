import { describe, expect, it } from "vitest";
import { encodeRoutes } from "../travel/routes-binary";
import { RoutesFileSchema } from "./routes-file";

const good = () =>
  encodeRoutes({
    buildings: ["ESJ", "IRB"],
    distance: (_mode, from, to) => (from === to ? 0 : 1320),
  }).slice().buffer as ArrayBuffer;

describe("RoutesFileSchema", () => {
  it("reads bytes that decode", () => {
    expect(RoutesFileSchema.safeParse(good()).success).toBe(true);
  });

  it.each([
    ["bad magic", (b: Uint8Array) => b.fill(0, 0, 4)],
    [
      "a newer version",
      (b: Uint8Array) => new DataView(b.buffer).setUint16(4, 99, true),
    ],
  ])("says %s is broken, with why", (_name, spoil) => {
    const bytes = good();
    spoil(new Uint8Array(bytes));
    const parsed = RoutesFileSchema.safeParse(bytes);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).toMatch(/magic|version/);
  });

  it("says a cut-short file is broken", () => {
    expect(RoutesFileSchema.safeParse(good().slice(0, 10)).success).toBe(false);
  });

  it("isn't bytes at all", () => {
    expect(RoutesFileSchema.safeParse({}).success).toBe(false);
  });
});
