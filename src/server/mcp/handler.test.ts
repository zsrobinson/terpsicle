import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  COURSE_INDEX_MANIFEST_KEY,
  calendarKey,
  courseIndexDeptKey,
  courseSearchKey,
  deptChunkKey,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  manifestKey,
  OFFERED_MANIFEST_KEY,
  offeredKey,
  PLANETTERP_MANIFEST_KEY,
  planetTerpDeptKey,
  planetTerpIndexKey,
  seatsKey,
  TERMS_KEY,
} from "~/core/schema";
import {
  aCourse,
  aCourseIndexDept,
  aCourseIndexEntry,
  aCourseIndexManifest,
  aCourseSearchFile,
  aDeptChunk,
  aManifest,
  aPlanetTerpDept,
  aPlanetTerpIndex,
  aPlanetTerpManifest,
  aPublishedCalendar,
  aSeatsFile,
  aSection,
  aTerm,
  aTermsFile,
  aTimedMeeting,
  FIXTURE_HASH,
  FIXTURE_NOW,
} from "~/fixtures";
import { clearPublishedCache } from "./data";
import { handleMcp, MCP_PATH, MCP_SERVER_CARD_PATH } from "./handler";

// /mcp (docs/MCP.md): the public MCP server over the published files, as
// a 2025-era client (the stateless fallback) and a 2026-07-28 one call it.

const ORIGIN = "https://terpsicle.com";
const H = FIXTURE_HASH;

async function put(key: string, value: unknown) {
  await env.DATA.put(key, JSON.stringify(value));
}

/** Spring 2027 is listed with CMSC351 and CMSC330; CMSC474 runs every fall. */
async function seed() {
  await put(
    TERMS_KEY,
    aTermsFile({
      terms: [
        aTerm(),
        aTerm({ id: "202608", name: "Fall 2026", season: "fall", year: 2026 }),
      ],
    }),
  );
  const algorithms = aCourse({
    sections: [
      aSection({ code: "0101" }),
      aSection({
        code: "0201",
        instructors: ["Bo Chen"],
        meetings: [aTimedMeeting({ start: 840, end: 890 })],
      }),
    ],
  });
  const languages = aCourse({
    code: "CMSC330",
    title: "Organization of Programming Languages",
    prerequisite: null,
    sections: [
      aSection({
        code: "0101",
        meetings: [aTimedMeeting({ start: 630, end: 680 })],
      }),
    ],
  });
  for (const termId of ["202701", "202608"]) {
    await put(manifestKey(termId), aManifest({ termId }));
    await put(
      deptChunkKey(termId, "CMSC", H),
      aDeptChunk({ termId, courses: [languages, algorithms] }),
    );
    await put(
      seatsKey(termId, H),
      aSeatsFile({
        termId,
        seats: {
          "CMSC351-0101": [0, 40, 5, null],
          "CMSC351-0201": [12, 40, 0, null],
          "CMSC330-0101": [3, 40, 0, null],
        },
      }),
    );
  }
  await put(calendarKey("202701"), aPublishedCalendar());
  await put(COURSE_INDEX_MANIFEST_KEY, aCourseIndexManifest());
  await put(
    courseSearchKey(H),
    aCourseSearchFile({
      courses: [
        ["CMSC330", "Organization of Programming Languages", 3, 3, []],
        ["CMSC351", "Algorithms", 3, 3, []],
        ["CMSC474", "Computational Game Theory", 3, 3, []],
      ],
    }),
  );
  await put(
    courseIndexDeptKey("CMSC", H),
    aCourseIndexDept({
      courses: [
        aCourseIndexEntry({
          code: "CMSC330",
          title: "Organization of Programming Languages",
          prerequisite: null,
          prereqs: { groups: [], complete: true },
          offered: ["202701", "202608"],
        }),
        aCourseIndexEntry({ offered: ["202701", "202608"] }),
        aCourseIndexEntry({
          code: "CMSC474",
          title: "Computational Game Theory",
          offered: ["202608"],
        }),
      ],
    }),
  );
  const falls = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map(
    (y) => ({
      termId: `${y}08`,
      source: "umdio",
      instructors: ["Ada Brandt"],
      sections: [{ code: "0101", instructors: ["Ada Brandt"] }],
    }),
  );
  const recorded: string[] = [];
  for (let y = 2027; y >= 2018; y--) recorded.push(`${y}08`, `${y}01`);
  await put(HISTORY_MANIFEST_KEY, {
    schemaVersion: 1,
    generatedAt: FIXTURE_NOW,
    terms: recorded
      .filter((t) => t <= "202701")
      .map((termId) => ({
        termId,
        hash: H,
        courses: { terpsicle: 1, umdio: 0, planetterp: 0 },
      })),
    departments: [{ code: "CMSC", hash: H }],
  });
  await put(historyDeptKey("CMSC", H), {
    schemaVersion: 1,
    dept: "CMSC",
    courses: [
      { code: "CMSC474", title: "Computational Game Theory", offerings: falls },
    ],
  });
  await put(OFFERED_MANIFEST_KEY, {
    schemaVersion: 1,
    generatedAt: FIXTURE_NOW,
    hash: H,
    built: {},
  });
  await put(offeredKey(H), {
    schemaVersion: 1,
    terms: ["202508", "202601", "202608"],
    courses: [["CMSC474", "Computational Game Theory", 3, 3, "5"]],
  });
  await put(PLANETTERP_MANIFEST_KEY, {
    ...aPlanetTerpManifest(),
    index: { hash: H },
  });
  await put(planetTerpDeptKey("CMSC", H), aPlanetTerpDept());
  await put(planetTerpIndexKey(H), aPlanetTerpIndex());
}

beforeAll(seed);
beforeEach(() => clearPublishedCache());

let nextId = 1;

/** A 2025-era call: answered statelessly, as JSON or one SSE event. */
async function legacy(method: string, params: object = {}) {
  const response = await handleMcp(
    new Request(`${ORIGIN}${MCP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    }),
    env,
  );
  const text = await response.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return { response, body: JSON.parse(data ? data.slice(6) : text) };
}

/** A tool's answer: its JSON, or its error text. */
async function tool(name: string, args: object = {}) {
  const { body } = await legacy("tools/call", { name, arguments: args });
  const text: string = body.result.content[0].text;
  return body.result.isError
    ? { error: text }
    : { value: JSON.parse(text), error: null };
}

describe("the endpoint", () => {
  it("initializes a 2025-era client with its instructions", async () => {
    const { response, body } = await legacy("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(body.result.serverInfo.name).toBe("terpsicle");
    expect(body.result.instructions).toContain("umd_search_courses");
  });

  it("lists read-only tools, each described", async () => {
    const { body } = await legacy("tools/list");
    const tools: {
      name: string;
      description: string;
      annotations: Record<string, boolean>;
    }[] = body.result.tools;
    expect(tools.map((t) => t.name)).toEqual([
      "umd_list_terms",
      "umd_list_departments",
      "umd_search_courses",
      "umd_get_course",
      "umd_get_sections",
      "umd_check_offerings",
      "umd_course_history",
      "umd_find_instructors",
      "umd_get_instructor",
      "umd_check_schedule",
      "umd_generate_schedules",
    ]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      });
    }
  });

  it("answers a 2026-07-28 call statelessly", async () => {
    const response = await handleMcp(
      new Request(`${ORIGIN}${MCP_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "umd_list_terms",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "umd_list_terms",
            arguments: {},
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" },
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    const body = await response.json<{
      result: { content: { text: string }[] };
    }>();
    expect(JSON.parse(body.result.content[0]?.text ?? "").defaultTerm).toEqual({
      id: "202701",
      name: "Spring 2027",
    });
  });

  it("tells a person who opens it what it is, and serves its card", async () => {
    const page = await handleMcp(new Request(`${ORIGIN}${MCP_PATH}`), env);
    expect(page.status).toBe(405);
    expect(await page.text()).toContain("Streamable HTTP");
    const card = await handleMcp(
      new Request(`${ORIGIN}${MCP_SERVER_CARD_PATH}`),
      env,
    );
    expect(card.headers.get("Content-Type")).toBe(
      "application/mcp-server-card+json",
    );
    expect(await card.json()).toMatchObject({
      remotes: [{ type: "streamable-http", url: `${ORIGIN}/mcp` }],
    });
    const preflight = await handleMcp(
      new Request(`${ORIGIN}${MCP_PATH}`, { method: "OPTIONS" }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Mcp-Method",
    );
  });

  it("refuses an address over its limit", async () => {
    const response = await handleMcp(
      new Request(`${ORIGIN}${MCP_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      { ...env, MCP_RATE_LIMIT: { limit: async () => ({ success: false }) } },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});

describe("the tools", () => {
  it("lists terms with the default and its calendar", async () => {
    const { value } = await tool("umd_list_terms");
    expect(value.defaultTerm.id).toBe("202701");
    expect(value.terms[0].calendar).toHaveProperty("classesStart");
    expect(value.history.termsOnRecord).toBeGreaterThan(10);
  });

  it("searches a term, and says when a match it doesn't have runs", async () => {
    const { value } = await tool("umd_search_courses", { query: "CMSC" });
    expect(value.results.map((r: { code: string }) => r.code)).toEqual([
      "CMSC330",
      "CMSC351",
    ]);
    expect(value.results[1]).toMatchObject({
      sections: 2,
      sectionsWithOpenSeats: 1,
    });
    expect(value.notOfferedThisTerm[0].code).toBe("CMSC474");
    const open = await tool("umd_search_courses", {
      dept: "CMSC",
      level: 300,
      limit: 1,
    });
    expect(open.value.results).toHaveLength(1);
    expect(open.value.nextOffset).toBe(1);
    const nothing = await tool("umd_search_courses", {});
    expect(nothing.error).toContain("Give a query");
    const badGenEd = await tool("umd_search_courses", { gen_eds: ["XXXX"] });
    expect(badGenEd.error).toContain("DSHU (Humanities)");
  });

  it("describes a course: prerequisites, the term, grades, the pattern", async () => {
    const { value } = await tool("umd_get_course", { course_code: "cmsc 351" });
    expect(value).toMatchObject({
      code: "CMSC351",
      prerequisiteCourses: { allOf: ["CMSC250", "CMSC216"], complete: true },
      thisTerm: { offered: true, sections: 2, openSeats: 12 },
    });
    expect(value.grades.overall.averageGpa).toBeGreaterThan(2);
    expect(value.links.testudo).toContain("/soc/202701/CMSC/CMSC351");
    const later = await tool("umd_get_course", { course_code: "CMSC474" });
    expect(later.value.thisTerm.offered).toBe(false);
    expect(later.value.offering.usually).toBe("Fall only");
    expect(later.value.offering.next).toBe("likely Fall 2027");
  });

  it("explains a bad course or term in words the agent can act on", async () => {
    expect(
      (await tool("umd_get_course", { course_code: "CS1" })).error,
    ).toContain("4-letter department");
    expect(
      (await tool("umd_get_course", { course_code: "CMSC999" })).error,
    ).toContain("No course CMSC999");
    expect(
      (
        await tool("umd_get_sections", {
          course_code: "CMSC351",
          term: "Fall 2030",
        })
      ).error,
    ).toContain("Spring 2027 (202701)");
    expect(
      (await tool("umd_get_sections", { course_code: "CMSC474" })).error,
    ).toContain("isn't offered in Spring 2027");
  });

  it("lists sections with seats, filtered to open ones", async () => {
    const { value } = await tool("umd_get_sections", {
      course_code: "CMSC351",
      open_only: true,
    });
    expect(value.sections).toHaveLength(1);
    expect(value.sections[0]).toMatchObject({
      key: "CMSC351-0201",
      meetings: ["MWF 2pm–2:50pm · IRB 0324"],
      seats: { open: 12, total: 40 },
    });
  });

  it("checks offerings in listed and later terms", async () => {
    const { value } = await tool("umd_check_offerings", {
      courses: ["CMSC474"],
      terms: ["Fall 2026", "Spring 2027", "Fall 2027", "202801"],
    });
    expect(value.courses[0].terms).toEqual({
      "Fall 2026": "yes",
      "Spring 2027": "no",
      "Fall 2027": "likely",
      "Spring 2028": "unlikely",
    });
  });

  it("lists who taught a course each term", async () => {
    const { value } = await tool("umd_course_history", {
      course_code: "CMSC474",
      limit: 2,
    });
    expect(value.terms[0]).toEqual({
      term: "Fall 2026",
      instructors: ["Ada Brandt"],
      sections: 1,
      source: "umdio",
    });
    expect(value.more).toContain("7 older terms");
  });

  it("finds an instructor and what they taught", async () => {
    const found = await tool("umd_find_instructors", { name: "ada" });
    expect(found.value.instructors[0].slug).toBe("brandt");
    const { value } = await tool("umd_get_instructor", {
      instructor: "Ada Brandt",
    });
    expect(value).toMatchObject({ slug: "brandt", rating: 4.2, reviews: 61 });
    expect(value.courses[0]).toMatchObject({ course: "CMSC474" });
    expect(value.grades[0].course).toBe("CMSC351");
    expect(
      (await tool("umd_get_instructor", { instructor: "zzzz" })).error,
    ).toContain("No instructor");
  });

  it("checks a schedule and suggests the switch that fixes it", async () => {
    const { value } = await tool("umd_check_schedule", {
      sections: ["CMSC351-0101", "cmsc330 0101"],
    });
    expect(value.credits).toEqual({ min: 6, max: 6 });
    const overlap = value.problems.find(
      (p: { kind: string }) => p.kind === "overlap",
    );
    expect(overlap.fix).toContain("CMSC351-0201");
    expect(value.verdict).toContain("warnings");
    expect(
      (await tool("umd_check_schedule", { sections: ["CMSC351-0901"] })).error,
    ).toContain("no section CMSC351-0901");
  });

  it("generates schedules that fit, or says what to loosen", async () => {
    const { value } = await tool("umd_generate_schedules", {
      courses: [{ code: "CMSC351" }, { code: "CMSC330" }],
    });
    expect(value.found).toBeGreaterThan(0);
    expect(value.schedules[0].sections).toEqual([
      "CMSC351-0201",
      "CMSC330-0101",
    ]);
    const none = await tool("umd_generate_schedules", {
      courses: [{ code: "CMSC351" }],
      days_off: ["M"],
    });
    expect(none.value.schedules).toEqual([]);
    expect(none.value.wouldHelp[0]).toContain("Monday");
    expect(
      (
        await tool("umd_generate_schedules", {
          courses: [{ code: "CMSC474" }],
        })
      ).error,
    ).toContain("isn't offered in Spring 2027");
  });
});
