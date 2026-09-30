import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  historyTermKey,
} from "~/core/schema";
import {
  HistoryDeptSchema,
  HistoryManifestSchema,
  HistoryTermSchema,
} from "~/core/schema/history";
import { aHistoryCourse } from "~/fixtures";
import { createMemoryBlobStore } from "./blob-store";
import { publishHistory } from "./history";
import { backfillUmdio, HISTORY_UMDIO_KEY } from "./history-umdio";
import { createHttpClient } from "./http";
import { readJson, silentLogger } from "./publish";

const fixture = (name: string) =>
  readFileSync(
    new URL(`./__fixtures__/umdio/${name}`, import.meta.url),
    "utf8",
  );
/** A real page: Fall 2018's first 100 sections, AASP100 to AGNR388. */
const PAGE_1 = fixture("sections-201808-page1.json");
const LIST = fixture("list-201808-a.json");
const now = new Date("2026-09-30T12:00:00Z");
const log = silentLogger;
const noWait = async () => {};

/** umd.io with Fall 2018's first page, then nothing, and Summer 2018 empty. */
function fakeUmdio() {
  const requests: string[] = [];
  const client = createHttpClient({
    sleep: noWait,
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname + url.search);
      if (url.pathname === "/v1/courses/semesters")
        return Response.json([201805, 201808]);
      if (url.pathname === "/v1/courses/list")
        return new Response(
          url.searchParams.get("semester") === "201808" ? LIST : "[]",
        );
      if (url.pathname === "/v1/courses/sections") {
        const first =
          url.searchParams.get("semester") === "201808" &&
          url.searchParams.get("page") === "1";
        return new Response(first ? PAGE_1 : "[]");
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { client, requests };
}

/** A history with PlanetTerp's AASP100 and our own AAST200 in Fall 2018. */
async function historyWithFall2018() {
  const store = createMemoryBlobStore();
  await publishHistory({
    store,
    now,
    log,
    updates: [
      {
        termId: "201808",
        courses: [
          aHistoryCourse({
            code: "AASP100",
            title: null,
            credits: null,
            source: "planetterp",
            instructors: ["Shane Walsh"],
            sections: [{ code: "0101", instructors: ["Shane Walsh"] }],
          }),
          aHistoryCourse({
            code: "AAST200",
            title: "Introduction to Asian American Studies",
            instructors: ["Ours Only"],
            sections: [{ code: "0101", instructors: ["Ours Only"] }],
          }),
        ],
      },
    ],
  });
  return store;
}

async function term(
  store: ReturnType<typeof createMemoryBlobStore>,
  id: string,
) {
  const manifest = await readJson(
    store,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
  );
  const entry = manifest?.terms.find((t) => t.termId === id);
  return {
    entry,
    file: entry
      ? await readJson(
          store,
          historyTermKey(entry.termId, entry.hash),
          HistoryTermSchema,
        )
      : null,
  };
}

describe("umd.io backfill", () => {
  it("records a term as umd.io lists it: below ours, above PlanetTerp's", async () => {
    const store = await historyWithFall2018();
    const { client } = fakeUmdio();
    const result = await backfillUmdio({
      http: client,
      store,
      now,
      log,
      terms: ["201808"],
      sleep: noWait,
    });
    expect(result.errors).toEqual([]);
    expect(result.byTerm["201808"]?.courses).toBe(50);
    const { entry, file } = await term(store, "201808");
    expect(entry?.courses).toEqual({ terpsicle: 1, umdio: 49, planetterp: 0 });
    const aasp100 = file?.courses.find((c) => c.code === "AASP100");
    // umd.io has every section, not only the one that reported grades.
    expect(aasp100?.source).toBe("umdio");
    expect(aasp100?.sections.map((s) => s.code)).toEqual([
      "0101",
      "0201",
      "0301",
      "0401",
      "0501",
      "0601",
    ]);
    expect(aasp100?.title).toBe("Introduction to African American Studies");
    // Ours stays ours.
    const aast200 = file?.courses.find((c) => c.code === "AAST200");
    expect(aast200?.source).toBe("terpsicle");
    expect(aast200?.instructors).toEqual(["Ours Only"]);
    // The department files read the same.
    const manifest = await readJson(
      store,
      HISTORY_MANIFEST_KEY,
      HistoryManifestSchema,
    );
    const aasp = manifest?.departments.find((d) => d.code === "AASP");
    const dept = await readJson(
      store,
      historyDeptKey("AASP", aasp?.hash ?? ""),
      HistoryDeptSchema,
    );
    expect(dept?.courses[0]?.offerings[0]?.source).toBe("umdio");
    // And the term is done: a rerun asks for nothing but the term list.
    expect(
      await readJson(
        store,
        HISTORY_UMDIO_KEY,
        z.object({ done: z.array(z.string()) }),
      ),
    ).toEqual({ done: ["201808"] });
    const again = fakeUmdio();
    const rerun = await backfillUmdio({
      http: again.client,
      store,
      now,
      log,
      terms: ["201808"],
      sleep: noWait,
    });
    expect(rerun.alreadyDone).toEqual(["201808"]);
    expect(again.requests).toEqual(["/v1/courses/semesters"]);
  });

  it("fills only the terms the history lacks, and records nothing from an empty term", async () => {
    const store = await historyWithFall2018();
    const { client, requests } = fakeUmdio();
    const result = await backfillUmdio({
      http: client,
      store,
      now,
      log,
      sleep: noWait,
    });
    expect(result.todo).toEqual(["201805"]);
    expect(result.errors).toEqual(["201805: umd.io listed no sections"]);
    expect((await term(store, "201805")).entry).toBeUndefined();
    expect(requests.some((r) => r.includes("semester=201808"))).toBe(false);
  });

  it("carries a term on from its last page, and writes nothing on a dry run", async () => {
    const store = await historyWithFall2018();
    const saved = new Map<string, string>();
    const cache = {
      read: async (t: string) => saved.get(t) ?? null,
      write: async (t: string, text: string) => {
        saved.set(t, text);
      },
    };
    let asked = 0;
    const first = await backfillUmdio({
      http: fakeUmdio().client,
      store,
      now,
      log,
      terms: ["201808"],
      cache,
      // Stop after the first page.
      shouldStop: () => asked++ > 0,
      sleep: noWait,
    });
    expect(first.stoppedEarly).toBe(true);
    expect(first.left).toEqual(["201808"]);
    const before = [...store.writes];
    const second = fakeUmdio();
    const dry = await backfillUmdio({
      http: second.client,
      store,
      now,
      log,
      terms: ["201808"],
      cache,
      dryRun: true,
      sleep: noWait,
    });
    // Page 1 came from the cache; page 2 was empty (asked twice, after a
    // full page), then the titles.
    expect(second.requests.filter((r) => r.endsWith("&page=1"))).toEqual([]);
    expect(dry.byTerm["201808"]?.courses).toBe(50);
    expect(store.writes).toEqual(before);
  });
});
