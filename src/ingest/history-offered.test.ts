import { describe, expect, it } from "vitest";
import { readHistoryOffered } from "~/core/history";
import { OFFERED_MANIFEST_KEY, offeredKey } from "~/core/schema";
import {
  HistoryOfferedManifestSchema,
  HistoryOfferedSchema,
} from "~/core/schema/history";
import { aHistoryCourse, FIXTURE_NOW } from "~/fixtures";
import { createMemoryBlobStore } from "./blob-store";
import { publishHistory } from "./history";
import { publishHistoryOffered } from "./history-offered";
import { readJson, silentLogger } from "./publish";

const now = new Date(FIXTURE_NOW);
const log = silentLogger;

const course = (code: string, title = `${code} title`) =>
  aHistoryCourse({ code, title, instructors: [], sections: [] });

async function offeredOf(store: ReturnType<typeof createMemoryBlobStore>) {
  const manifest = await readJson(
    store,
    OFFERED_MANIFEST_KEY,
    HistoryOfferedManifestSchema,
  );
  if (!manifest) throw new Error("no offered manifest");
  const file = await readJson(
    store,
    offeredKey(manifest.hash),
    HistoryOfferedSchema,
  );
  if (!file) throw new Error("no offered file");
  return { manifest, file, read: readHistoryOffered(file) };
}

describe("publishHistoryOffered", () => {
  it("builds the file from every term, then reads only terms that changed", async () => {
    const store = createMemoryBlobStore();
    await publishHistory({
      store,
      now,
      log,
      updates: [
        { termId: "202608", courses: [course("CMSC473"), course("CMSC351")] },
        { termId: "202701", courses: [course("CMSC351"), course("CMSC452")] },
      ],
    });
    const first = await publishHistoryOffered({ store, now, log });
    expect(first).toMatchObject({ terms: 2, courses: 3, written: 1 });
    const built = await offeredOf(store);
    expect([...(built.read.get("CMSC351")?.ran ?? [])]).toEqual([
      "202608",
      "202701",
    ]);

    // Nothing new: nothing read, nothing written.
    expect(await publishHistoryOffered({ store, now, log })).toMatchObject({
      terms: 0,
      written: 0,
    });

    // Spring gains a course: only Spring is read again.
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: "202701", courses: [course("CMSC456")] }],
    });
    expect(await publishHistoryOffered({ store, now, log })).toMatchObject({
      terms: 1,
      courses: 4,
      written: 1,
    });
    const after = await offeredOf(store);
    expect([...(after.read.get("CMSC456")?.ran ?? [])]).toEqual(["202701"]);
    expect([...(after.read.get("CMSC473")?.ran ?? [])]).toEqual(["202608"]);
  });

  it("does nothing without a history", async () => {
    const store = createMemoryBlobStore();
    expect(await publishHistoryOffered({ store, now, log })).toMatchObject({
      terms: 0,
      written: 0,
    });
    expect(await store.get(OFFERED_MANIFEST_KEY)).toBeNull();
  });

  it("rebuilds from the history when its own file won't read", async () => {
    const store = createMemoryBlobStore();
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: "202701", courses: [course("CMSC452")] }],
    });
    await publishHistoryOffered({ store, now, log });
    const { manifest } = await offeredOf(store);
    await store.put(
      offeredKey(manifest.hash),
      new TextEncoder().encode("{broken"),
    );
    const again = await publishHistoryOffered({ store, now, log });
    expect(again.terms).toBe(1);
    expect(again.errors).toHaveLength(1);
    expect((await offeredOf(store)).file.courses.map((c) => c[0])).toEqual([
      "CMSC452",
    ]);
  });
});
