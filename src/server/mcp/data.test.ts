import { describe, expect, it } from "vitest";
import { FIXTURE_HASH } from "~/fixtures";
import { clearPublishedCache, mcpData } from "./data";

// What the MCP server keeps between requests (docs/MCP.md, "Reads"):
// hashed files' checked values and what's derived from them, settled only;
// fixed-name files are read fresh each request.

/** A bucket that counts its reads. */
function countingBucket(files: Record<string, unknown>) {
  const reads: string[] = [];
  const bucket = {
    async get(key: string) {
      reads.push(key);
      if (!(key in files)) return null;
      const text = JSON.stringify(files[key]);
      return {
        json: async () => JSON.parse(text),
        arrayBuffer: async () => new TextEncoder().encode(text).buffer,
      };
    },
  } as unknown as R2Bucket;
  return { bucket, reads };
}

const HASHED_KEY = `history/dept/CMSC.${FIXTURE_HASH}.json`;

describe("the published data's cache", () => {
  it("keeps a hashed file across requests, and shares a read within one", async () => {
    clearPublishedCache();
    const { bucket, reads } = countingBucket({
      "history/manifest.json": {
        schemaVersion: 1,
        generatedAt: "2026-11-05T00:00:00.000Z",
        terms: [],
        departments: [{ code: "CMSC", hash: FIXTURE_HASH }],
      },
      [HASHED_KEY]: { schemaVersion: 1, dept: "CMSC", courses: [] },
    });
    const first = mcpData(bucket);
    await Promise.all([first.historyDept("CMSC"), first.historyDept("CMSC")]);
    expect(reads.filter((k) => k === HASHED_KEY)).toHaveLength(1);
    expect(reads.filter((k) => k === "history/manifest.json")).toHaveLength(1);

    const second = mcpData(bucket);
    expect(await second.historyDept("CMSC")).toMatchObject({ dept: "CMSC" });
    // The manifest again (it says what's current), the hashed file not.
    expect(reads.filter((k) => k === HASHED_KEY)).toHaveLength(1);
    expect(reads.filter((k) => k === "history/manifest.json")).toHaveLength(2);
  });

  it("never keeps a missing or unreadable file", async () => {
    clearPublishedCache();
    const { bucket, reads } = countingBucket({
      "catalog/terms.json": { not: "a terms file" },
    });
    expect(await mcpData(bucket).terms()).toEqual([]);
    expect(await mcpData(bucket).historyDept("CMSC")).toBeNull();
    await mcpData(bucket).terms();
    expect(reads.filter((k) => k === "catalog/terms.json")).toHaveLength(2);
  });

  it("keeps what's derived from a hashed file beside it", async () => {
    clearPublishedCache();
    const { bucket } = countingBucket({});
    let built = 0;
    const build = async () => {
      built += 1;
      return { built };
    };
    const key = `courses/search.${FIXTURE_HASH}.json#offered.none`;
    await mcpData(bucket).derive(key, build);
    expect(await mcpData(bucket).derive(key, build)).toEqual({ built: 1 });
    expect(built).toBe(1);
  });
});
