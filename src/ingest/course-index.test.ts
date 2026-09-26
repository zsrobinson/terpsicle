import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePrerequisite } from "~/core/catalog";
import {
  COURSE_INDEX_MANIFEST_KEY,
  CourseIndexDeptSchema,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  courseIndexDeptKey,
  courseSearchKey,
  type DeptChunk,
  DeptChunkSchema,
  deptChunkKey,
  type Manifest,
  ManifestSchema,
  manifestKey,
  TERMS_KEY,
  type Term,
  TermsFileSchema,
} from "~/core/schema";
import { aManifest, aTerm, aTermsFile } from "~/fixtures";
import { createMemoryBlobStore, type MemoryBlobStore } from "./blob-store";
import { COURSE_INDEX_STATE_KEY, publishCourseIndex } from "./course-index";
import { readJson, silentLogger, writeHashed, writeJson } from "./publish";
import { buildDeptChunk } from "./soc/chunk";
import { normalizeCourse } from "./soc/normalize";
import { parseDepartmentPage } from "./soc/parse-department";
import { parseSectionsPage } from "./soc/parse-sections";

// The course index built from the saved Testudo pages in __fixtures__/soc
// (captured 2026-09-25), as the catalog job would find them in R2: 202701,
// 202612 and 202608 active, 202605 archived.

const FIXTURES = new URL("./__fixtures__/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

/** Every saved department page, as `[term, dept]`. */
function savedDepartments(): [string, string][] {
  const out: [string, string][] = [];
  for (const term of readdirSync(new URL("soc/", FIXTURES))) {
    if (!/^\d{6}$/.test(term)) continue;
    let files: string[] = [];
    try {
      files = readdirSync(new URL(`soc/${term}/dept/`, FIXTURES));
    } catch {
      continue; // 202408 kept only its (empty) department list.
    }
    for (const file of files) {
      const dept = file.replace(/\.html$/, "");
      if (/^[A-Z]{4}$/.test(dept)) out.push([term, dept]);
    }
  }
  return out.sort();
}

function chunkFor(term: string, dept: string): DeptChunk {
  const page = parseDepartmentPage(read(`soc/${term}/dept/${dept}.html`));
  const sections = parseSectionsPage(read(`soc/${term}/sections/${dept}.html`));
  return buildDeptChunk(term, dept, page, sections).chunk;
}

const TERMS: Term[] = [
  aTerm({ id: "202701", name: "Spring 2027" }),
  aTerm({
    id: "202612",
    name: "Winter 2027",
    season: "winter",
    year: 2027,
  }),
  aTerm({ id: "202608", name: "Fall 2026", season: "fall", year: 2026 }),
  aTerm({
    id: "202605",
    name: "Summer 2026",
    season: "summer",
    year: 2026,
    status: "archived",
  }),
];

/** Writes terms.json, and every chunk with its term's manifest, like the catalog job. */
async function seed(
  store: MemoryBlobStore,
  chunks: readonly DeptChunk[],
  terms: readonly Term[] = TERMS,
): Promise<void> {
  await writeJson(store, TERMS_KEY, aTermsFile({ terms: [...terms] }));
  const byTerm = new Map<string, Manifest["departments"]>();
  for (const chunk of chunks) {
    const { hash } = await writeHashed(
      store,
      DeptChunkSchema,
      chunk,
      (h) => deptChunkKey(chunk.termId, chunk.dept, h),
      "chunk",
    );
    const list = byTerm.get(chunk.termId) ?? [];
    list.push({
      code: chunk.dept,
      name: chunk.dept,
      hash,
      courseCount: chunk.courses.length,
      sectionCount: 0,
    });
    byTerm.set(chunk.termId, list);
  }
  for (const [termId, departments] of byTerm)
    await writeJson(
      store,
      manifestKey(termId),
      aManifest({ termId, departments, seats: null, changes: null }),
    );
}

const allChunks = () => savedDepartments().map(([t, d]) => chunkFor(t, d));

async function publish(store: MemoryBlobStore, now = "2026-09-25T12:00:00Z") {
  return publishCourseIndex({ store, now: new Date(now), log: silentLogger });
}

async function indexFile(store: MemoryBlobStore, dept: string) {
  const manifest = await readJson(
    store,
    COURSE_INDEX_MANIFEST_KEY,
    CourseIndexManifestSchema,
  );
  const entry = manifest?.departments.find((d) => d.code === dept);
  if (!entry) throw new Error(`${dept} isn't in the course index`);
  return readJson(
    store,
    courseIndexDeptKey(dept, entry.hash),
    CourseIndexDeptSchema,
  );
}

describe("prerequisites (golden)", () => {
  it("reads every saved prerequisite sentence the same way", async () => {
    const sentences = new Map<string, string>();
    for (const [term, dept] of savedDepartments()) {
      const page = parseDepartmentPage(read(`soc/${term}/dept/${dept}.html`));
      for (const raw of page.courses) {
        const text = normalizeCourse(raw, []).prerequisite;
        if (text && !sentences.has(text))
          sentences.set(text, `${term} ${raw.code}`);
      }
    }
    expect(sentences.size).toBeGreaterThan(60);
    const golden = [...sentences].map(([text, where]) => ({
      where,
      text,
      ...parsePrerequisite(text),
    }));
    await expect(`${JSON.stringify(golden, null, 1)}\n`).toMatchFileSnapshot(
      "./__fixtures__/golden/prerequisites.json",
    );
  });
});

describe("course index", () => {
  it("matches the golden department files", async () => {
    const store = createMemoryBlobStore();
    await seed(store, allChunks());
    await publish(store);
    for (const dept of ["CMSC", "GEOL"]) {
      await expect(
        `${JSON.stringify(await indexFile(store, dept), null, 1)}\n`,
      ).toMatchFileSnapshot(`./__fixtures__/golden/courses-${dept}.json`);
    }
  });

  it("lists every course of every term once, with the terms it was offered in", async () => {
    const store = createMemoryBlobStore();
    const chunks = allChunks();
    await seed(store, chunks);
    const result = await publish(store);
    expect(result.errors).toEqual([]);
    expect(result.terms).toBe(4);

    const cmsc = await indexFile(store, "CMSC");
    const offered = (code: string) =>
      cmsc?.courses.find((c) => c.code === code)?.offered;
    // Newest first, whichever term is active.
    expect(offered("CMSC798")).toEqual(["202701", "202612", "202605"]);
    expect(offered("CMSC351")).toEqual(["202701", "202605"]);
    expect(offered("CMSC388A")).toEqual(["202612"]);

    const manifest = await readJson(
      store,
      COURSE_INDEX_MANIFEST_KEY,
      CourseIndexManifestSchema,
    );
    const search = await readJson(
      store,
      courseSearchKey(manifest?.search.hash ?? ""),
      CourseSearchFileSchema,
    );
    const codes = new Set(chunks.flatMap((c) => c.courses.map((x) => x.code)));
    expect(search?.courses.map((r) => r[0])).toEqual([...codes].sort());
    expect(result.courses).toBe(codes.size);
    expect(search?.courses.find((r) => r[0] === "GEOL100")).toEqual([
      "GEOL100",
      "Physical Geology",
      3,
      3,
      ["DSNL", "DSNS"],
    ]);
  });

  it("keeps gen-ed conditions and takes text from the newest active term", async () => {
    const store = createMemoryBlobStore();
    const spring = chunkFor("202701", "CMSC");
    const summer = chunkFor("202605", "CMSC");
    const renamed = {
      ...summer,
      courses: summer.courses.map((c) => ({ ...c, title: `${c.title} (old)` })),
    };
    await seed(store, [spring, renamed, chunkFor("202701", "GEOL")]);
    await publish(store);
    const cmsc = await indexFile(store, "CMSC");
    expect(cmsc?.courses.find((c) => c.code === "CMSC351")?.title).toBe(
      "Algorithms",
    );
    const geol = await indexFile(store, "GEOL");
    const conditional = geol?.courses.find((c) =>
      c.genEds.some((g) => g.some((o) => o.condition)),
    );
    expect(conditional?.genEds.flat()).toContainEqual({
      code: "DSNL",
      condition: "if taken with GEOL110",
    });
  });

  it("rewrites nothing when the catalog hasn't changed, and only what changed when it has", async () => {
    const store = createMemoryBlobStore();
    const chunks = allChunks();
    await seed(store, chunks);
    await publish(store);
    const manifestBefore = await store.get(COURSE_INDEX_MANIFEST_KEY);

    store.writes.length = 0;
    const again = await publish(store, "2026-09-25T18:00:00Z");
    expect(again.rebuilt).toBe(0);
    expect(store.writes).toEqual([COURSE_INDEX_STATE_KEY]);
    expect(await store.get(COURSE_INDEX_MANIFEST_KEY)).toEqual(manifestBefore);

    // A new course in one term's GEOL chunk rebuilds GEOL alone.
    const geol = chunkFor("202701", "GEOL");
    const extra = {
      ...geol,
      courses: [
        ...geol.courses,
        {
          ...(geol.courses[0] as DeptChunk["courses"][number]),
          code: "GEOL999",
        },
      ],
    };
    await seed(store, [
      ...chunks.filter((c) => !(c.termId === "202701" && c.dept === "GEOL")),
      extra,
    ]);
    store.writes.length = 0;
    const changed = await publish(store, "2026-09-26T00:00:00Z");
    expect(changed.rebuilt).toBe(1);
    expect(store.writes.filter((k) => k.startsWith("courses/")).sort()).toEqual(
      [
        expect.stringMatching(/^courses\/dept\/GEOL\.[0-9a-f]{16}\.json$/),
        COURSE_INDEX_MANIFEST_KEY,
        expect.stringMatching(/^courses\/search\.[0-9a-f]{16}\.json$/),
      ],
    );
    const manifest = await readJson(
      store,
      COURSE_INDEX_MANIFEST_KEY,
      CourseIndexManifestSchema,
    );
    expect(manifest?.generatedAt).toBe("2026-09-26T00:00:00.000Z");
  });

  it("keeps a department's last file when a chunk is missing, and retries next run", async () => {
    const store = createMemoryBlobStore();
    const chunks = allChunks();
    await seed(store, chunks);
    await publish(store);
    const before = await indexFile(store, "CMSC");

    // A newer CMSC chunk in the manifest whose file isn't there.
    const spring = chunks.find(
      (c) => c.termId === "202701" && c.dept === "CMSC",
    );
    const manifest = await readJson(
      store,
      manifestKey("202701"),
      ManifestSchema,
    );
    await writeJson(store, manifestKey("202701"), {
      ...manifest,
      departments: manifest?.departments.map((d) =>
        d.code === "CMSC" ? { ...d, hash: "ffffffffffffffff" } : d,
      ),
    });
    const result = await publish(store);
    expect(result.errors).toEqual([
      expect.stringContaining(
        "courses CMSC: catalog/202701/dept/CMSC.ffffffffffffffff.json is missing",
      ),
    ]);
    expect(await indexFile(store, "CMSC")).toEqual(before);

    // Once the chunk is there, the next run rebuilds it.
    if (spring)
      await store.put(
        deptChunkKey("202701", "CMSC", "ffffffffffffffff"),
        JSON.stringify(spring),
      );
    const retried = await publish(store);
    expect(retried.errors).toEqual([]);
    expect(retried.rebuilt).toBe(1);
  });

  it("leaves the index alone when no term's catalog can be read", async () => {
    const store = createMemoryBlobStore();
    await seed(store, allChunks());
    await publish(store);
    const before = await store.get(COURSE_INDEX_MANIFEST_KEY);
    for (const t of TERMS) await store.delete(manifestKey(t.id));
    const result = await publish(store);
    expect(result.errors).toEqual([
      expect.stringContaining("left the index alone"),
    ]);
    expect(await store.get(COURSE_INDEX_MANIFEST_KEY)).toEqual(before);
  });

  it("skips a term whose manifest it can't read", async () => {
    const store = createMemoryBlobStore();
    await seed(store, allChunks());
    await store.put(manifestKey("202605"), '{"schemaVersion":2}');
    const result = await publish(store);
    expect(result.terms).toBe(3);
    expect(result.errors).toEqual([expect.stringContaining("202605")]);
    const cmsc = await indexFile(store, "CMSC");
    expect(cmsc?.courses.find((c) => c.code === "CMSC798")?.offered).toEqual([
      "202701",
      "202612",
    ]);
  });

  it("deletes files it no longer references a day after they drop out", async () => {
    const store = createMemoryBlobStore();
    const chunks = allChunks();
    await seed(store, chunks);
    await publish(store);
    const first = await readJson(
      store,
      COURSE_INDEX_MANIFEST_KEY,
      CourseIndexManifestSchema,
    );
    const oldSearch = courseSearchKey(first?.search.hash ?? "");

    await seed(
      store,
      chunks.filter((c) => c.dept !== "BUSI"),
    );
    await publish(store, "2026-09-25T18:00:00Z");
    expect(await store.get(oldSearch)).not.toBeNull();
    const later = await publish(store, "2026-09-26T19:00:00Z");
    expect(later.deleted).toBe(2); // The old search file and BUSI's.
    expect(await store.get(oldSearch)).toBeNull();
    expect(
      (await store.list("courses/dept/")).some((k) => k.includes("BUSI")),
    ).toBe(false);
  });

  it("does nothing before the catalog job has written terms.json", async () => {
    const store = createMemoryBlobStore();
    expect((await publish(store)).departments).toBe(0);
    expect(await store.list("courses/")).toEqual([]);
    expect(TermsFileSchema.safeParse(null).success).toBe(false);
  });
});
