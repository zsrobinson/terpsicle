import fc from "fast-check";
import { deflateSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  aBlock,
  aCourse,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSection,
  aSharePayload,
} from "~/fixtures";
import { buildCatalogIndex, snapshotOf } from "../catalog/catalog-index";
import { diffPlanAgainstCatalog } from "../catalog/plan-diff";
import {
  COURSE_COLORS,
  type Course,
  DAYS,
  type Day,
  type PlanCourse,
  type SharePayload,
  SharePayloadSchema,
} from "../schema";
import {
  coursesFromShare,
  sharedViewPlan,
  sharePayloadFromPlan,
} from "./plan-share";
import {
  decodeShare,
  encodeShare,
  fromBase64Url,
  MAX_SHARE_PARAM_LENGTH,
  normalizeSharePayload,
  shareUrl,
  toBase64Url,
} from "./share";

/** A plan course placed in one of `course`'s sections, snapshotted as it is now. */
function placed(course: Course, sectionCode: string): PlanCourse {
  const section = course.sections.find((s) => s.code === sectionCode);
  if (!section) throw new Error(`${course.code} has no section ${sectionCode}`);
  return aPlanCourse({
    courseCode: course.code,
    sectionCode,
    snapshot: snapshotOf(section),
  });
}

const TERM = "202701";

const typical: SharePayload = aSharePayload({
  sections: [
    "CMSC351-0101",
    "CMSC330-0201",
    "STAT400-0101",
    "ENGL393-0312",
    "ECON200-0104",
  ],
  saved: ["MUSC130"],
  blocks: [{ label: "Lunch", days: ["M", "W", "F"], start: 720, end: 780 }],
  colors: {
    CMSC351: "blue",
    CMSC330: "green",
    STAT400: "amber",
    ENGL393: "violet",
    ECON200: "cyan",
    MUSC130: "pink",
  },
});

describe("share codec", () => {
  it("round-trips a typical plan in a short link", () => {
    const param = encodeShare(typical);
    expect(decodeShare(param)).toEqual({ ok: true, payload: typical });
    expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
    // Five sections, a saved course, a block and colors: about half the plain-JSON link.
    expect(param.length).toBeLessThan(160);
  });

  it("is well under the plain-JSON encoding", () => {
    const plain = toBase64Url(
      deflateSync(strToU8(JSON.stringify(typical)), { level: 9 }),
    );
    expect(encodeShare(typical).length).toBeLessThan(plain.length * 0.6);
  });

  it("builds the URL", () => {
    expect(shareUrl("https://terpsicle.com/", typical)).toBe(
      `https://terpsicle.com/?plan=${encodeShare(typical)}`,
    );
  });

  it("drops empty lists and colors for courses outside the plan", () => {
    const p: SharePayload = {
      v: 1,
      termId: TERM,
      sections: [],
      saved: [],
      blocks: [],
      colors: { CMSC351: "blue" },
    };
    expect(normalizeSharePayload(p)).toEqual({
      v: 1,
      termId: TERM,
      sections: [],
    });
    expect(decodeShare(encodeShare(p))).toEqual({
      ok: true,
      payload: { v: 1, termId: TERM, sections: [] },
    });
  });

  it("round-trips any valid payload (property)", () => {
    const course = fc.stringMatching(/^[A-Z]{4}\d{3}[A-Z]?$/);
    const days = fc.subarray([...DAYS] as Day[], { minLength: 1 });
    const block = fc
      .record({
        label: fc.string({ minLength: 1, maxLength: 40 }),
        days,
        start: fc.integer({ min: 0, max: 1439 }),
        len: fc.integer({ min: 1, max: 600 }),
      })
      .map(({ len, ...b }) => ({ ...b, end: Math.min(1440, b.start + len) }));
    const payload = fc
      .record({
        courses: fc.uniqueArray(course, { maxLength: 30 }),
        split: fc.nat(),
        sectionCode: fc.stringMatching(/^[A-Z0-9]{4}$/),
        name: fc.option(fc.string({ minLength: 1, maxLength: 60 }), {
          nil: undefined,
        }),
        blocks: fc.array(block, { maxLength: 5 }),
        colors: fc.array(
          fc.option(fc.constantFrom(...COURSE_COLORS), { nil: null }),
          { maxLength: 30 },
        ),
      })
      .map(({ courses, split, sectionCode, name, blocks, colors }) => {
        const k = courses.length ? split % (courses.length + 1) : 0;
        const colorMap: Record<string, (typeof COURSE_COLORS)[number]> = {};
        courses.forEach((c, i) => {
          const color = colors[i];
          if (color) colorMap[c] = color;
        });
        return SharePayloadSchema.safeParse({
          v: 1,
          termId: TERM,
          ...(name === undefined ? {} : { name }),
          sections: courses.slice(0, k).map((c) => `${c}-${sectionCode}`),
          saved: courses.slice(k),
          blocks,
          colors: colorMap,
        });
      })
      .filter((r) => r.success)
      .map((r) => r.data as SharePayload);
    fc.assert(
      fc.property(payload, (p) => {
        expect(decodeShare(encodeShare(p))).toEqual({
          ok: true,
          payload: normalizeSharePayload(p),
        });
      }),
    );
  });

  describe("bad links get a typed error", () => {
    const wire = (value: unknown) =>
      toBase64Url(deflateSync(strToU8(JSON.stringify(value))));
    it.each([
      ["empty", ""],
      ["too long", "A".repeat(MAX_SHARE_PARAM_LENGTH + 1)],
      ["not base64url", "abc$def"],
      ["impossible length", "abcde"],
      ["not deflate", toBase64Url(strToU8("hello world"))],
      ["not an array", wire({ v: 1 })],
      ["wrong shape", wire([1, TERM, 0, 5, "", [], ""])],
      ["bad section key", wire([1, TERM, 0, "CMSC351", "", [], ""])],
      [
        "bad block",
        wire([1, TERM, 0, "", "", [["Lunch", "MX", 720, 780]], ""]),
      ],
      ["bad block tuple", wire([1, TERM, 0, "", "", [["Lunch"]], ""])],
      ["color without a course", wire([1, TERM, 0, "", "", [], "0"])],
      ["unknown color", wire([1, TERM, 0, "CMSC351-0101", "", [], "z"])],
      [
        "duplicate course",
        wire([1, TERM, 0, "CMSC351-0101 CMSC351-0201", "", [], ""]),
      ],
    ])("%s", (_name, param) => {
      const result = decodeShare(param);
      expect(result).toMatchObject({ ok: false, error: { kind: "malformed" } });
    });

    it("from a newer version", () => {
      expect(decodeShare(wire([2, TERM]))).toEqual({
        ok: false,
        error: {
          kind: "newer-version",
          message:
            "This link was made by a newer version of Terpsicle. Reload to open it.",
        },
      });
    });
  });

  it("encodes base64url without padding", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        const text = toBase64Url(bytes);
        expect(text).not.toContain("=");
        expect(fromBase64Url(text)).toEqual(bytes);
      }),
    );
  });
});

describe("plans and share payloads", () => {
  const cmsc351 = aCourse({
    code: "CMSC351",
    sections: [aSection({ code: "0101" })],
  });
  const cmsc330 = aCourse({ code: "CMSC330" });
  const index = buildCatalogIndex(TERM, [cmsc351, cmsc330]);

  it("encodes a plan with its term's blocks and its courses' colors", () => {
    const plan = aPlan({
      termId: TERM,
      courses: [placed(cmsc351, "0101"), aSavedCourse("CMSC330")],
    });
    const blocks = [
      aBlock({ termId: TERM }),
      aBlock({ termId: "202608", id: "block-fall" }),
    ];
    const payload = sharePayloadFromPlan(plan, blocks, {
      CMSC351: "blue",
      MATH240: "pink",
    });
    expect(payload).toEqual({
      v: 1,
      termId: TERM,
      name: "Plan A",
      sections: ["CMSC351-0101"],
      saved: ["CMSC330"],
      blocks: [{ label: "Lunch", days: ["M", "W", "F"], start: 720, end: 780 }],
      colors: { CMSC351: "blue" },
    });
    expect(SharePayloadSchema.safeParse(payload).success).toBe(true);
    expect(sharePayloadFromPlan(aPlan({ courses: [] }), [], {})).toEqual({
      v: 1,
      termId: TERM,
      name: "Plan A",
      sections: [],
    });
  });

  it("caps each list at 40", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      aCourse({ code: `CMSC${100 + i}` }),
    );
    const plan = aPlan({
      termId: TERM,
      courses: [
        ...many.map((c) => placed(c, "0101")),
        ...many.map((c) => aSavedCourse(c.code.replace("CMSC", "MATH"))),
      ],
    });
    const p = sharePayloadFromPlan(plan, [], {});
    expect(p.sections).toHaveLength(40);
    expect(p.saved).toHaveLength(40);
  });

  it("shows missing sections as cancelled in the shared view", () => {
    const payload: SharePayload = {
      v: 1,
      termId: TERM,
      sections: ["CMSC351-0101", "CMSC351H-0101"],
      saved: ["CMSC330"],
    };
    const plan = sharedViewPlan(
      payload,
      index,
      "shared-view",
      "2026-09-25T12:00:00.000Z",
    );
    expect(plan.name).toBe("Shared plan");
    expect(plan.courses.map((c) => [c.courseCode, c.sectionCode])).toEqual([
      ["CMSC351", "0101"],
      ["CMSC351H", "0101"],
      ["CMSC330", null],
    ]);
    // biome-ignore lint/style/noNonNullAssertion: built with a section
    expect(plan.courses[0]?.snapshot).toEqual(snapshotOf(cmsc351.sections[0]!));
    expect(
      diffPlanAgainstCatalog(plan, index).map((d) => [d.key, d.kind]),
    ).toEqual([["CMSC351H-0101", "cancelled"]]);
  });

  it("saves a copy with fresh snapshots, naming what it dropped", () => {
    const payload: SharePayload = {
      v: 1,
      termId: TERM,
      sections: ["CMSC351-0101", "CMSC351-0201", "MATH240-0101"],
      saved: ["CMSC330", "ENGL101"],
    };
    const { courses, dropped } = coursesFromShare(payload, index);
    expect(courses).toEqual([placed(cmsc351, "0101"), aSavedCourse("CMSC330")]);
    expect(dropped).toEqual(["CMSC351-0201", "MATH240-0101", "ENGL101"]);
  });
});
