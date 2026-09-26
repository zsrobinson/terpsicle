import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OG_IMAGE } from "~/features/marketing/meta";
import { OG_FILE, ogPng } from "./build-og-image";
import { ROOT } from "./lib/source-files";

describe("the link-preview image (scripts/build-og-image.ts)", () => {
  it("is the current hero and palette: regenerating changes nothing", () => {
    // If this fails after changing the hero or a color, run
    // `pnpm tsx scripts/build-og-image.ts` and commit public/og.png.
    const committed = readFileSync(path.join(ROOT, OG_FILE));
    expect({
      width: committed.readUInt32BE(16),
      height: committed.readUInt32BE(20),
    }).toEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height });
    expect(committed.equals(ogPng())).toBe(true);
  });
});
