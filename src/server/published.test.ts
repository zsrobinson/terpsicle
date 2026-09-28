// Reading published files from R2 (./published): the mock catalog, exactly
// as the jobs publish it, in the worker pool's real R2.
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TERMS_KEY, TermsFileSchema } from "~/core/schema";
import { buildMockDataFiles, fixtureTermId } from "~/fixtures";
import {
  currentOpenSeats,
  findCourse,
  findSection,
  findTerm,
  memoJson,
  readCalendar,
  readPlanetTerpDept,
  readPublished,
} from "./published";

beforeAll(async () => {
  for (const [key, bytes] of await buildMockDataFiles())
    if (/^(catalog|calendar|planetterp)\//.test(key))
      await env.DATA.put(key, bytes);
});

describe("readPublished", () => {
  it("parses a file against its schema", async () => {
    const terms = await readPublished(env.DATA, TERMS_KEY, TermsFileSchema);
    expect(terms?.terms.map((t) => t.id)).toContain(fixtureTermId);
  });

  it("reads a missing file, or one that doesn't match, as null", async () => {
    await env.DATA.put("test/published/wrong.json", '{"terms": 3}');
    expect(
      await readPublished(
        env.DATA,
        "test/published/none.json",
        TermsFileSchema,
      ),
    ).toBeNull();
    expect(
      await readPublished(
        env.DATA,
        "test/published/wrong.json",
        TermsFileSchema,
      ),
    ).toBeNull();
  });

  it("throws on a body that isn't JSON", async () => {
    await env.DATA.put("test/published/broken.json", "{");
    await expect(
      readPublished(env.DATA, "test/published/broken.json", TermsFileSchema),
    ).rejects.toThrow();
  });
});

describe("the catalog", () => {
  it("finds a term, a course and a section", async () => {
    expect((await findTerm(env.DATA, fixtureTermId))?.id).toBe(fixtureTermId);
    expect((await findCourse(env.DATA, fixtureTermId, "CMSC351"))?.code).toBe(
      "CMSC351",
    );
    const found = await findSection(env.DATA, fixtureTermId, "CMSC351-0101");
    expect(found?.term.id).toBe(fixtureTermId);
    expect(found?.course.code).toBe("CMSC351");
    expect(found?.section.code).toBe("0101");
  });

  it("answers null for what the catalog doesn't have", async () => {
    expect(await findTerm(env.DATA, "199901")).toBeNull();
    expect(await findCourse(env.DATA, fixtureTermId, "CMSC999")).toBeNull();
    expect(await findCourse(env.DATA, fixtureTermId, "ZZZZ100")).toBeNull();
    expect(
      await findSection(env.DATA, fixtureTermId, "CMSC351-9999"),
    ).toBeNull();
    expect(await findSection(env.DATA, "199901", "CMSC351-0101")).toBeNull();
    expect(await findSection(env.DATA, fixtureTermId, "not a key")).toBeNull();
  });

  it("reads each file once through a memoized reader", async () => {
    const get = vi.fn((key: string) => env.DATA.get(key));
    const read = memoJson({ get } as unknown as R2Bucket);
    await findSection(read, fixtureTermId, "CMSC351-0101");
    await findSection(read, fixtureTermId, "CMSC351-0102");
    // terms.json, the manifest and CMSC's file: once each.
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("reads the calendar and a section's open seats", async () => {
    expect(await readCalendar(env.DATA, fixtureTermId)).not.toBeNull();
    expect(await readCalendar(env.DATA, "199901")).toBeNull();
    // Full in the mock seats.
    expect(
      await currentOpenSeats(env.DATA, fixtureTermId, "CMSC351-0101"),
    ).toBe(0);
    expect(
      await currentOpenSeats(env.DATA, fixtureTermId, "CMSC999-0101"),
    ).toBeNull();
  });
});

describe("PlanetTerp", () => {
  it("reads a department's current file, or null without one", async () => {
    expect((await readPlanetTerpDept(env.DATA, "CMSC"))?.names).toBeDefined();
    expect(await readPlanetTerpDept(env.DATA, "ZZZZ")).toBeNull();
  });
});
