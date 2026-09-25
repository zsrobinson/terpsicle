import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aCourse,
  aManifest,
  aManifestDepartment,
  aMeeting,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSection,
  aSectionSnapshot,
  FIXTURE_NOW,
} from "~/fixtures";
import type { CatalogChange, Course, Manifest, PlanCourse } from "../schema";
import {
  buildCatalogIndex,
  findCourse,
  findSection,
  placedSections,
  snapshotOf,
} from "./catalog-index";
import {
  type CachedCatalog,
  cachedCatalogOf,
  diffManifest,
} from "./manifest-diff";
import {
  courseDept,
  diffPlanAgainstCatalog,
  pendingPlanDepts,
  snapshotChanges,
} from "./plan-diff";
import {
  capGhosts,
  collapsedGroupKey,
  GHOST_CAP,
  groupSectionsByInstructor,
  groupSectionsByTime,
  timeGroupLabel,
  timeSignature,
} from "./section-groups";

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

describe("catalog index", () => {
  const b = aCourse({
    code: "CMSC351",
    sections: [aSection({ code: "0101" }), aSection({ code: "0201" })],
  });
  const a = aCourse({ code: "CMSC330" });
  const index = buildCatalogIndex(TERM, [b, a]);

  it("looks up courses and sections by key, in code order", () => {
    expect([...index.courses.keys()]).toEqual(["CMSC330", "CMSC351"]);
    expect(findCourse(index, "CMSC351")).toBe(b);
    expect(findSection(index, "CMSC351-0201")).toMatchObject({
      key: "CMSC351-0201",
      course: b,
    });
    expect(findSection(index, "CMSC351-9999")).toBeUndefined();
  });

  it("lists a plan's placed sections still in the catalog, in plan order", () => {
    const plan = aPlan({
      termId: TERM,
      courses: [
        { ...placed(b, "0201"), sectionCode: "0301" },
        placed(a, "0101"),
        aSavedCourse("MATH240"),
        { ...placed(b, "0101"), courseCode: "ENGL101" },
      ],
    });
    expect(placedSections(plan, index).map((r) => r.key)).toEqual([
      "CMSC330-0101",
    ]);
  });
});

describe("diffPlanAgainstCatalog", () => {
  const original = aCourse({
    code: "CMSC351",
    sections: [aSection({ code: "0101" }), aSection({ code: "0201" })],
  });
  const plan = aPlan({
    termId: TERM,
    courses: [
      placed(original, "0101"),
      placed(original, "0201"),
      aSavedCourse("CMSC330"),
    ],
  });

  it("finds nothing when the catalog matches the snapshots", () => {
    expect(
      diffPlanAgainstCatalog(plan, buildCatalogIndex(TERM, [original])),
    ).toEqual([]);
  });

  it("reports moved meetings, new instructors and delivery changes", () => {
    const moved = aCourse({
      code: "CMSC351",
      sections: [
        aSection({
          code: "0101",
          meetings: [aMeeting({ days: ["Tu", "Th"], start: 660, end: 735 })],
        }),
        aSection({
          code: "0201",
          instructors: ["Justin Wyss-Gallifent"],
          delivery: "blended",
        }),
      ],
    });
    const changes: CatalogChange[] = [
      {
        kind: "changed",
        sectionKey: "CMSC351-0101",
        at: "2026-09-20T10:00:00.000Z",
        before: snapshotOf(aSection()),
        after: snapshotOf(aSection()),
      },
      {
        kind: "changed",
        sectionKey: "CMSC351-0101",
        at: "2026-09-10T10:00:00.000Z",
        before: snapshotOf(aSection()),
        after: snapshotOf(aSection()),
      },
    ];
    const diffs = diffPlanAgainstCatalog(
      plan,
      buildCatalogIndex(TERM, [moved]),
      changes,
    );
    expect(
      diffs.map((d) => [
        d.key,
        d.kind,
        d.kind === "changed" ? d.parts : null,
        d.at,
      ]),
    ).toEqual([
      ["CMSC351-0101", "changed", ["meetings"], "2026-09-20T10:00:00.000Z"],
      ["CMSC351-0201", "changed", ["instructors", "delivery"], null],
    ]);
  });

  it("reports sections Testudo stopped listing as cancelled", () => {
    const now = aCourse({ code: "CMSC351", sections: [] });
    const changes: CatalogChange[] = [
      {
        kind: "cancelled",
        sectionKey: "CMSC351-0201",
        at: "2026-09-21T10:00:00.000Z",
        before: aSectionSnapshot(),
      },
    ];
    const diffs = diffPlanAgainstCatalog(
      plan,
      buildCatalogIndex(TERM, [now]),
      changes,
    );
    expect(diffs.map((d) => [d.key, d.kind, d.at])).toEqual([
      ["CMSC351-0101", "cancelled", null],
      ["CMSC351-0201", "cancelled", "2026-09-21T10:00:00.000Z"],
    ]);
  });

  it("never calls a section cancelled while its department is still loading", () => {
    const empty = buildCatalogIndex(TERM, []);
    expect(diffPlanAgainstCatalog(plan, empty, [], new Set(["CMSC"]))).toEqual(
      [],
    );
    // Another department pending doesn't excuse this one.
    expect(
      diffPlanAgainstCatalog(plan, empty, [], new Set(["MATH"])).map(
        (d) => d.kind,
      ),
    ).toEqual(["cancelled", "cancelled"]);
  });
});

describe("pendingPlanDepts", () => {
  const plan = aPlan({
    termId: TERM,
    courses: [
      aPlanCourse({ courseCode: "CMSC351" }),
      aPlanCourse({ courseCode: "MATH141" }),
      aSavedCourse("ENGL101"),
      aPlanCourse({ courseCode: "GONE100" }),
    ],
  });

  it("lists the plan's departments the manifest has but that haven't loaded", () => {
    const listed = new Set(["CMSC", "MATH", "ENGL"]);
    expect([...pendingPlanDepts(plan, listed, (d) => d === "MATH")]).toEqual([
      "CMSC",
      "ENGL",
    ]);
    expect(pendingPlanDepts(plan, listed, () => true).size).toBe(0);
  });

  it("doesn't wait for a department the manifest dropped", () => {
    expect([...pendingPlanDepts(plan, new Set(["CMSC"]), () => false)]).toEqual(
      ["CMSC"],
    );
  });

  it("takes a course's department from its code", () => {
    expect(courseDept("CMSC351")).toBe("CMSC");
  });

  it("reports changed dates", () => {
    const base = snapshotOf(aSection());
    const later = {
      ...base,
      dates: { start: "2027-03-22", end: "2027-05-11" },
    };
    expect(snapshotChanges(base, later)).toEqual(["dates"]);
    expect(
      snapshotChanges(later, { ...later, dates: { ...later.dates } }),
    ).toEqual([]);
  });

  it("compares meetings field by field", () => {
    const base = snapshotOf(aSection());
    const untimed = { ...base, meetings: [anUntimedMeeting()] };
    expect(snapshotChanges(base, untimed)).toEqual(["meetings"]);
    expect(
      snapshotChanges(untimed, { ...untimed, meetings: [anUntimedMeeting()] }),
    ).toEqual([]);
    expect(
      snapshotChanges(base, {
        ...base,
        meetings: [aMeeting({ room: "1115" })],
      }),
    ).toEqual(["meetings"]);
    expect(
      snapshotChanges(base, {
        ...base,
        meetings: [aMeeting({ days: ["M", "W"] })],
      }),
    ).toEqual(["meetings"]);
    expect(snapshotChanges(base, { ...base, meetings: [] })).toEqual([
      "meetings",
    ]);
  });
});

describe("diffManifest", () => {
  const manifest = (
    depts: [string, string][],
    seats: string | null = null,
    changes: string | null = null,
  ): Manifest =>
    aManifest({
      departments: depts.map(([code, hash]) =>
        aManifestDepartment({ code, name: code, hash }),
      ),
      seats: seats ? { hash: seats, asOf: null, fetchedAt: FIXTURE_NOW } : null,
      changes: changes ? { hash: changes, count: 0, latestAt: null } : null,
    });
  const h = (n: number) => n.toString(16).padStart(16, "0");

  it("fetches everything the first time", () => {
    const next = manifest(
      [
        ["AAAA", h(1)],
        ["BBBB", h(2)],
      ],
      h(9),
      h(8),
    );
    expect(diffManifest(null, next)).toEqual({
      fetch: ["AAAA", "BBBB"],
      drop: [],
      seats: true,
      changes: true,
    });
  });

  it("fetches only what changed", () => {
    const cached = cachedCatalogOf(
      manifest(
        [
          ["AAAA", h(1)],
          ["BBBB", h(2)],
          ["CCCC", h(3)],
        ],
        h(9),
        h(8),
      ),
    );
    const next = manifest(
      [
        ["AAAA", h(1)],
        ["BBBB", h(5)],
        ["DDDD", h(4)],
      ],
      h(9),
      h(7),
    );
    expect(diffManifest(cached, next)).toEqual({
      fetch: ["BBBB", "DDDD"],
      drop: ["CCCC"],
      seats: false,
      changes: true,
    });
  });

  it("refetches everything on a schema version change", () => {
    const cached: CachedCatalog = {
      ...cachedCatalogOf(manifest([["AAAA", h(1)]], h(9))),
      schemaVersion: 0,
    };
    expect(diffManifest(cached, manifest([["AAAA", h(1)]], h(9)))).toEqual({
      fetch: ["AAAA"],
      drop: [],
      seats: true,
      changes: false,
    });
  });

  it("is minimal and complete (property)", () => {
    const dept = fc.stringMatching(/^[A-Z]{4}$/);
    const hash = fc.integer({ min: 0, max: 5 }).map(h);
    const depts = fc.uniqueArray(fc.tuple(dept, hash), {
      selector: (d) => d[0],
      maxLength: 12,
    });
    fc.assert(
      fc.property(
        depts,
        depts,
        fc.option(hash),
        fc.option(hash),
        (before, after, s1, s2) => {
          const cached = cachedCatalogOf(manifest(before, s1));
          const next = manifest(after, s2);
          const diff = diffManifest(cached, next);
          const had = new Map(before);
          const fetched = new Set(diff.fetch);
          for (const [code, hsh] of after) {
            // Complete: every changed or new department is fetched; minimal: nothing else is.
            expect(fetched.has(code)).toBe(had.get(code) !== hsh);
          }
          expect(diff.fetch.length).toBe(fetched.size);
          const listed = new Set(after.map(([c]) => c));
          expect(new Set(diff.drop)).toEqual(
            new Set(before.map(([c]) => c).filter((c) => !listed.has(c))),
          );
          expect(diff.seats).toBe(s2 !== null && s1 !== s2);
        },
      ),
    );
  });
});

describe("time groups (ghosts)", () => {
  const mwf10 = [aMeeting()];
  const tuth = [aMeeting({ days: ["Tu", "Th"], start: 660, end: 735 })];
  const course = aCourse({
    sections: [
      aSection({ code: "0101", meetings: mwf10 }),
      aSection({
        code: "0102",
        meetings: [aMeeting({ building: "ESJ", room: "2204" })],
      }),
      aSection({ code: "0103", meetings: tuth }),
      aSection({ code: "0104", meetings: mwf10 }),
      aSection({ code: "0105", meetings: [anUntimedMeeting()] }),
    ],
  });

  it("merges time-identical sections, whatever the room", () => {
    const groups = groupSectionsByTime(course);
    expect(groups.map((g) => [g.label, g.sections.map((s) => s.code)])).toEqual(
      [
        ["0101–0104 · 3 sections", ["0101", "0102", "0104"]],
        ["0103", ["0103"]],
      ],
    );
  });

  it("leaves out the placed section", () => {
    expect(groupSectionsByTime(course, ["0101"])[0]?.label).toBe(
      "0102–0104 · 2 sections",
    );
  });

  it("keeps meeting order out of the signature, but dates in it", () => {
    const both = [aMeeting(), aMeeting({ days: ["Tu"], start: 800, end: 850 })];
    expect(timeSignature(aSection({ meetings: both }))).toBe(
      timeSignature(aSection({ meetings: [...both].reverse() })),
    );
    expect(
      timeSignature(
        aSection({
          dates: { start: "2027-01-25", end: "2027-03-12" },
        }),
      ),
    ).not.toBe(timeSignature(aSection()));
    expect(timeGroupLabel([])).toBe("");
  });

  it("caps ghosts at 12 by section order", () => {
    const many = aCourse({
      sections: Array.from({ length: 15 }, (_, i) =>
        aSection({
          code: `0${100 + i + 1}`,
          meetings: [aMeeting({ start: 480 + i * 60, end: 530 + i * 60 })],
        }),
      ),
    });
    const { shown, overflow } = capGhosts(groupSectionsByTime(many));
    expect(shown).toHaveLength(GHOST_CAP);
    expect(shown[0]?.label).toBe("0101");
    expect(overflow.map((g) => g.label)).toEqual(["0113", "0114", "0115"]);
  });
});

describe("instructor groups", () => {
  it("groups in section order, never by name", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0101", instructors: ["Zed Zulu"] }),
        aSection({ code: "0201", instructors: ["Amy Alpha"] }),
        aSection({ code: "0301", instructors: [] }),
        aSection({ code: "0401", instructors: ["Zed Zulu"] }),
        aSection({ code: "0501", instructors: ["Zed Zulu", "Amy Alpha"] }),
      ],
    });
    const groups = groupSectionsByInstructor(course);
    expect(groups.map((g) => [g.name, g.sections.map((s) => s.code)])).toEqual([
      ["Zed Zulu", ["0101", "0401"]],
      ["Amy Alpha", ["0201"]],
      ["", ["0301"]],
      ["Zed Zulu, Amy Alpha", ["0501"]],
    ]);
    expect(groups[2]?.instructors).toEqual([]);
    expect(collapsedGroupKey("CMSC351", { name: "" })).toBe("CMSC351|");
  });
});
