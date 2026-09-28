import { describe, expect, it } from "vitest";
import { DataError } from "~/state/data-source";
import { loadPlanetTerp, publishedSource, type Reader } from "./data";

// Server renders read R2 through the Worker's `serverContext.published`
// (src/server/pages/context.ts), which answers null for a missing file.

describe("publishedSource", () => {
  const files = {
    readJson: async (key: string) =>
      key === "planetterp/manifest.json"
        ? {
            schemaVersion: 1,
            generatedAt: "2026-09-25T12:00:00.000Z",
            gradesThrough: "202501",
            departments: [],
          }
        : null,
  };

  it("reads a file, and a missing one as missing", async () => {
    const source = publishedSource(files);
    expect(await source.readJson("planetterp/manifest.json")).toMatchObject({
      gradesThrough: "202501",
    });
    await expect(source.readJson("nothing.json")).rejects.toThrow(DataError);
  });

  it("feeds the loaders as the browser's source does", async () => {
    const reader: Reader = {
      source: publishedSource(files),
      memo: (_key, load) => load(),
      reviews: null,
      pageReviews: async () => ({
        terpsicle: null,
        planetTerp: [],
        next: null,
      }),
    };
    expect(await loadPlanetTerp(reader, "CMSC")).toEqual({
      dept: null,
      source: null,
      gradesThrough: "202501",
    });
  });
});
