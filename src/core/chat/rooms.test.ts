import { describe, expect, it } from "vitest";
import {
  aCourse,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSection,
  aTimedMeeting,
  fixtureTermId,
  mockCourses,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { MANY_SECTIONS } from "../catalog/section-groups";
import {
  type Course,
  type Day,
  type InstructorName,
  type Meeting,
  parseRoomId,
  RoomIdSchema,
  type Section,
} from "../schema";
import {
  myRooms,
  type Room,
  type RoomTree,
  roomsForCourse,
  roomsForSection,
} from "./rooms";

// The Chat canvas's four example courses, built from fixtures: one section
// (SOCY411), a few with separate lectures (CMSC351), lectures with
// discussions (CMSC131) and many TBA sections (ENGL101).

const TERM = "202608";
const MWF: Day[] = ["M", "W", "F"];
const TUTH: Day[] = ["Tu", "Th"];

const lecture = (
  days: Day[],
  start: number,
  building = "IRB",
  room = "0324",
  length = 50,
) => aTimedMeeting({ days, start, end: start + length, building, room });

const discussion = (days: Day[], start: number, room: string) =>
  aTimedMeeting({
    days,
    start,
    end: start + 50,
    kind: "discussion",
    building: "CSI",
    room,
  });

const section = (
  code: string,
  instructors: InstructorName[],
  meetings: Meeting[],
): Section => aSection({ code, instructors, meetings });

const socy411 = aCourse({
  code: "SOCY411",
  title: "Demographic Techniques",
  sections: [
    section(
      "0101",
      ["Michael Rendall"],
      [lecture(["M", "W"], 840, "SQH", "1111", 75)],
    ),
  ],
});

const cmsc351 = aCourse({
  code: "CMSC351",
  sections: [
    section("0101", ["Ting Jiang"], [lecture(MWF, 600)]),
    section("0201", ["Ting Jiang"], [lecture(MWF, 840)]),
    section("0301", ["Clyde Kruskal"], [lecture(MWF, 660, "CSI", "1115")]),
    section("0401", ["Clyde Kruskal"], [lecture(MWF, 720, "CSI", "1115")]),
  ],
});

/** Sections `<prefix>01`… sharing one lecture, each with its own discussion. */
function lectureSections(
  prefix: string,
  instructor: InstructorName,
  shared: Meeting,
  discussions: [Day[], number, string][],
): Section[] {
  return discussions.map(([days, start, room], i) =>
    section(
      `${prefix}0${i + 1}`,
      [instructor],
      [shared, discussion(days, start, room)],
    ),
  );
}

const cmsc131 = aCourse({
  code: "CMSC131",
  title: "Object-Oriented Programming I",
  sections: [
    ...lectureSections("01", "Elias Gonzalez", lecture(MWF, 600), [
      [TUTH, 480, "2120"],
      [TUTH, 480, "2118"],
      [TUTH, 570, "1121"],
      [TUTH, 570, "1122"],
    ]),
    ...lectureSections("02", "Nora Burkhauser", lecture(MWF, 780), [
      [TUTH, 840, "2120"],
      [TUTH, 840, "2118"],
      [TUTH, 930, "1121"],
      [TUTH, 930, "1122"],
    ]),
    ...lectureSections("03", "Pedram Sadeghian", lecture(MWF, 660), [
      [TUTH, 570, "2120"],
      [TUTH, 570, "2118"],
      [TUTH, 660, "1121"],
      [TUTH, 660, "2118"],
      [TUTH, 750, "2118"],
    ]),
    ...lectureSections("04", "Pedram Sadeghian", lecture(MWF, 720), [
      [TUTH, 840, "2120"],
      [TUTH, 840, "2118"],
      [TUTH, 930, "1121"],
      [TUTH, 930, "2118"],
      [TUTH, 1020, "2118"],
    ]),
    ...lectureSections(
      "05",
      "Aaron Kyei-Asare",
      lecture(TUTH, 1080, "ESJ", "0202", 75),
      [
        [["W"], 1020, "3117"],
        [["W"], 1020, "3118"],
      ],
    ),
  ],
});

/** 92 sections, instructor TBA, each its own class in its own room; two are async online. */
const engl101: Course = (() => {
  const slots: [Day[], number, number, number][] = [
    // days, start, length, how many sections
    [MWF, 480, 50, 1],
    [MWF, 540, 50, 5],
    [MWF, 600, 50, 6],
    [MWF, 660, 50, 6],
    [MWF, 720, 50, 7],
    [MWF, 780, 50, 6],
    [MWF, 840, 50, 5],
    [MWF, 900, 50, 4],
    [TUTH, 480, 75, 3],
    [TUTH, 570, 75, 6],
    [TUTH, 660, 75, 6],
    [TUTH, 750, 75, 6],
    [TUTH, 840, 75, 6],
    [TUTH, 930, 75, 5],
    [TUTH, 1020, 75, 4],
    [TUTH, 1110, 75, 4],
    [["M", "W"], 1020, 75, 10],
  ];
  const meetings: Meeting[] = slots.flatMap(([days, start, length, n]) =>
    Array.from({ length: n }, (_, i) =>
      lecture(
        days,
        start,
        ["KEY", "TWS", "ASY"][i % 3],
        String(1100 + start + i),
        length,
      ),
    ),
  );
  // Async online sections mid-list: they still go last, under "No set times".
  meetings.splice(45, 0, anUntimedMeeting(), anUntimedMeeting());
  const pad = (n: number) => String(n).padStart(2, "0");
  return aCourse({
    code: "ENGL101",
    title: "Academic Writing",
    sections: meetings.map((m, i) =>
      aSection({
        code: `${pad(Math.floor(i / 10) + 1)}${pad((i % 10) + 1)}`,
        instructors: [],
        delivery: m.online ? "online-async" : "f2f",
        meetings: [m],
      }),
    ),
  });
})();

/** One line per heading and room, indented like the room list. */
function outline(tree: RoomTree): string {
  const room = (r: Room, depth: number) =>
    `${"  ".repeat(depth)}${r.label}${r.detail ? `  —  ${r.detail}` : ""}  [${r.id}]`;
  const lines = [room(tree.course, 0), `  ${tree.course.description}`];
  for (const g of tree.groups) {
    if (g.heading) lines.push(`# ${g.title} · ${g.summary}  {${g.key}}`);
    for (const node of g.nodes) {
      lines.push(room(node.room, 1));
      for (const child of node.children) lines.push(room(child, 2));
    }
  }
  return `${lines.join("\n")}\n`;
}

describe("roomsForCourse: the canvas's four courses", () => {
  it("gives a one-section course one room, which is the class (SOCY411)", async () => {
    const tree = roomsForCourse(TERM, socy411);
    expect(tree.size).toBe("one");
    expect(tree.rooms).toEqual([tree.course]);
    expect(tree.groups).toEqual([]);
    expect(tree.course).toMatchObject({
      id: "202608:SOCY411",
      label: "SOCY411",
      detail: "Rendall · MW 2–3:15pm · SQH 1111",
      description:
        "Everyone in SOCY411 this term. It has one section, so this is its only room.",
    });
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/socy411.txt");
  });

  it("gives each of two professors a room over their sections (CMSC351)", async () => {
    const tree = roomsForCourse(TERM, cmsc351);
    expect(tree.rooms).toHaveLength(1 + 2 + 4);
    expect(tree.course.detail).toBe("4 sections · 2 professors");
    expect(tree.groups.map((g) => [g.title, g.summary, g.heading])).toEqual([
      ["Ting Jiang", "2 sections", true],
      ["Clyde Kruskal", "2 sections", true],
    ]);
    expect(tree.professors.map((r) => [r.id, r.label, r.detail])).toEqual([
      [
        "202608:CMSC351:P:ting-jiang",
        "Jiang's sections",
        "2 sections · 0101 and 0201",
      ],
      [
        "202608:CMSC351:P:clyde-kruskal",
        "Kruskal's sections",
        "2 sections · 0301 and 0401",
      ],
    ]);
    expect(tree.sections.map((r) => [r.label, r.parent])).toEqual([
      ["0101 · MWF 10am", "202608:CMSC351:P:ting-jiang"],
      ["0201 · MWF 2pm", "202608:CMSC351:P:ting-jiang"],
      ["0301 · MWF 11am", "202608:CMSC351:P:clyde-kruskal"],
      ["0401 · MWF 12pm", "202608:CMSC351:P:clyde-kruskal"],
    ]);
    expect(tree.professors[0]?.description).toBe(
      "People in Jiang's sections of CMSC351 (0101 and 0201), from their plans",
    );
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/cmsc351.txt");
  });

  it("has one level under the course: professors, then sections with every meeting (CMSC131)", async () => {
    const tree = roomsForCourse(TERM, cmsc131);
    expect(tree.rooms).toHaveLength(1 + 4 + 20);
    expect(tree.course.detail).toBe("20 sections · 4 professors");
    expect(tree.professors.map((r) => r.label)).toEqual([
      "Gonzalez's sections",
      "Burkhauser's sections",
      "Sadeghian's sections",
      "Kyei-Asare's sections",
    ]);
    const sadeghian = tree.groups[2];
    expect(sadeghian?.title).toBe("Pedram Sadeghian");
    expect(sadeghian?.summary).toBe("10 sections");
    const [node] = sadeghian?.nodes ?? [];
    expect(node?.room).toMatchObject({
      id: "202608:CMSC131:P:pedram-sadeghian",
      kind: "professor",
      detail: "10 sections · 0301–0405",
    });
    // No lecture layer: each section says its lecture and its discussion.
    expect(node?.children.slice(0, 3).map((r) => r.label)).toEqual([
      "0301 · MWF 11am and TuTh 9:30am discussion",
      "0302 · MWF 11am and TuTh 9:30am discussion",
      "0303 · MWF 11am and TuTh 11am discussion",
    ]);
    expect(node?.children[2]).toMatchObject({
      id: "202608:CMSC131:0303",
      parent: "202608:CMSC131:P:pedram-sadeghian",
      detail: "IRB 0324, CSI 1121",
      description: "People in section 0303 of CMSC131, from their plans",
    });
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/cmsc131.txt");
  });

  it("lists many TBA sections flat under the course, with no heading (ENGL101)", async () => {
    const tree = roomsForCourse(TERM, engl101);
    expect(engl101.sections).toHaveLength(92);
    expect(tree.size).toBe("many");
    expect(tree.professors).toEqual([]);
    expect(tree.rooms).toHaveLength(93);
    expect(tree.groups.map((g) => [g.title, g.heading])).toEqual([
      ["Instructor TBA", false],
    ]);
    expect(tree.sections.every((r) => r.parent === tree.course.id)).toBe(true);
    expect(tree.sections[2]).toMatchObject({
      label: "0103 · MWF 9am",
      detail: "TWS 1641",
    });
    expect(
      tree.sections.filter((r) => r.words === "online, no set time"),
    ).toHaveLength(2);
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/engl101.txt");
  });
});

describe("roomsForCourse: edge cases", () => {
  it("gives one professor no room of their own: the course room is theirs", () => {
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: lectureSections("01", "Ada Brandt", lecture(MWF, 600), [
          [["Tu"], 540, "2120"],
          [["Tu"], 600, "2120"],
          [["Th"], 540, "2120"],
        ]),
      }),
    );
    expect(tree.professors).toEqual([]);
    expect(tree.course.detail).toBe("3 sections");
    expect(tree.sections.map((r) => r.label)).toEqual([
      "0101 · MWF 10am and Tu 9am discussion",
      "0102 · MWF 10am and Tu 10am discussion",
      "0103 · MWF 10am and Th 9am discussion",
    ]);
    expect(tree.groups.map((g) => [g.summary, g.heading])).toEqual([
      ["3 sections", false],
    ]);
  });

  it("puts TBA sections next to a professor straight under the course", () => {
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: [
          section("0101", ["Ada Brandt"], [lecture(MWF, 600)]),
          section("0201", [], [lecture(MWF, 780)]),
          section("0102", ["Ada Brandt"], [lecture(MWF, 660)]),
        ],
      }),
    );
    expect(tree.groups.map((g) => [g.title, g.heading])).toEqual([
      ["Ada Brandt", true],
      ["Instructor TBA", true],
    ]);
    expect(tree.professors.map((r) => r.sectionCodes)).toEqual([
      ["0101", "0102"],
    ]);
    expect(tree.rooms.map((r) => [r.id, r.parent])).toEqual([
      ["202608:CMSC351", null],
      ["202608:CMSC351:P:ada-brandt", "202608:CMSC351"],
      ["202608:CMSC351:0101", "202608:CMSC351:P:ada-brandt"],
      ["202608:CMSC351:0102", "202608:CMSC351:P:ada-brandt"],
      ["202608:CMSC351:0201", "202608:CMSC351"],
    ]);
    expect(tree.course.detail).toBe("3 sections · 1 professor");
  });

  it("sorts sections by code, whatever order the catalog lists them in", () => {
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: [
          section("0102", [], [lecture(MWF, 600)]),
          section("0101", [], [lecture(MWF, 660)]),
        ],
      }),
    );
    expect(tree.sections.map((r) => r.code)).toEqual(["0101", "0102"]);
    expect(tree.course.sectionCodes).toEqual(["0101", "0102"]);
  });

  it("names a section by all its meetings, and says so when it has none", () => {
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: [
          section("0101", [], [lecture(MWF, 600), discussion(["F"], 720, "1")]),
          section("0102", [], []),
          section("0103", [], [anUntimedMeeting({ online: false })]),
        ],
      }),
    );
    expect(tree.sections.map((r) => [r.label, r.detail])).toEqual([
      ["0101 · MWF 10am and F 12pm discussion", "IRB 0324, CSI 1"],
      ["0102", ""],
      ["0103 · time TBA", ""],
    ]);
    expect(tree.groups.map((g) => g.title)).toEqual(["Instructor TBA"]);
  });

  it("groups many sections by professor, one level deep", () => {
    const course = aCourse({
      sections: Array.from({ length: MANY_SECTIONS + 1 }, (_, i) =>
        section(
          `01${String(i + 10)}`,
          [i % 2 ? "Lee Moss" : "Ada Brandt"],
          [lecture(MWF, 480 + i * 30)],
        ),
      ),
    });
    const tree = roomsForCourse(TERM, course);
    expect(tree.groups.map((g) => g.title)).toEqual(["Ada Brandt", "Lee Moss"]);
    expect(
      tree.rooms.every((r) =>
        r.kind === "section"
          ? tree.byId.get(r.parent ?? "")?.kind === "professor"
          : true,
      ),
    ).toBe(true);
  });
});

describe("room ids", () => {
  it("are built from codes and names, so a time or room change keeps them (and renames the room)", () => {
    const before = roomsForCourse(TERM, cmsc131);
    const moved = aCourse({
      ...cmsc131,
      sections: cmsc131.sections.map((s) =>
        s.code.startsWith("03")
          ? {
              ...s,
              meetings: [
                lecture(MWF, 690, "ESJ", "0224"),
                ...s.meetings.slice(1).map((m) => ({ ...m, room: "0115" })),
              ],
            }
          : s,
      ),
    });
    const after = roomsForCourse(TERM, moved);
    expect(after.rooms.map((r) => r.id)).toEqual(before.rooms.map((r) => r.id));
    expect(after.byId.get("202608:CMSC131:0303")).toMatchObject({
      label: "0303 · MWF 11:30am and TuTh 11am discussion",
      detail: "ESJ 0224, CSI 0115",
    });
  });

  it("don't shift when a section is added", () => {
    const before = roomsForCourse(TERM, cmsc131);
    const extra = section(
      "0306",
      ["Pedram Sadeghian"],
      [lecture(MWF, 660), discussion(TUTH, 840, "3120")],
    );
    const sections = [...cmsc131.sections];
    sections.splice(10, 0, extra);
    const after = roomsForCourse(TERM, aCourse({ ...cmsc131, sections }));
    const ids = new Set(after.rooms.map((r) => r.id));
    expect(before.rooms.every((r) => ids.has(r.id))).toBe(true);
    expect(after.byId.get("202608:CMSC131:0306")?.parent).toBe(
      "202608:CMSC131:P:pedram-sadeghian",
    );
  });

  it("differ by term, parse back, and are unique across the mock catalog", () => {
    expect(roomsForCourse("202701", cmsc351).course.id).toBe("202701:CMSC351");
    for (const course of mockCourses()) {
      const tree = roomsForCourse(fixtureTermId, course);
      const ids = tree.rooms.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of tree.rooms) {
        expect(RoomIdSchema.safeParse(r.id).success, r.id).toBe(true);
        expect(parseRoomId(r.id)).toMatchObject({
          termId: fixtureTermId,
          courseCode: course.code,
          kind: r.kind,
        });
      }
    }
  });
});

describe("roomsForCourse over the whole mock catalog", () => {
  it("lists every section once, under a parent that exists, one level below the course at most", () => {
    for (const course of mockCourses()) {
      const tree = roomsForCourse(fixtureTermId, course);
      const n = course.sections.length;
      if (n <= 1) {
        expect(tree.rooms).toEqual([tree.course]);
        continue;
      }
      expect(tree.sections).toHaveLength(n);
      expect(tree.rooms).toHaveLength(1 + tree.professors.length + n);
      const listed = tree.groups.flatMap((g) =>
        g.nodes.flatMap((node) => [node.room, ...node.children]),
      );
      expect(listed).toEqual(tree.rooms.slice(1));
      for (const r of tree.rooms.slice(1)) {
        const parent = r.parent ? tree.byId.get(r.parent) : undefined;
        expect(parent, r.id).toBeTruthy();
        expect(parent?.parent ?? null, r.id).toBe(
          parent?.kind === "course" ? null : tree.course.id,
        );
        expect(r.label, r.id).not.toMatch(/ · $|^ · /);
      }
      for (const p of tree.professors)
        expect(p.sectionCodes.length, p.id).toBeGreaterThan(0);
    }
  });

  it("is cached per course and term", () => {
    expect(roomsForCourse(TERM, cmsc131)).toBe(roomsForCourse(TERM, cmsc131));
  });
});

describe("roomsForSection and myRooms", () => {
  it("walks from the course room down to the section", () => {
    const tree = roomsForCourse(TERM, cmsc131);
    expect(roomsForSection(tree, "0303").map((r) => r.label)).toEqual([
      "CMSC131 · everyone",
      "Sadeghian's sections",
      "0303 · MWF 11am and TuTh 11am discussion",
    ]);
    expect(
      roomsForSection(roomsForCourse(TERM, engl101), "0201").map((r) => r.id),
    ).toEqual(["202608:ENGL101", "202608:ENGL101:0201"]);
    expect(roomsForSection(roomsForCourse(TERM, socy411), "0101")).toEqual([
      roomsForCourse(TERM, socy411).course,
    ]);
  });

  it("gives a plan's placed sections their rooms, in plan order", () => {
    const index = buildCatalogIndex(fixtureTermId, [
      cmsc131,
      cmsc351,
      socy411,
      engl101,
    ]);
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "SOCY411", sectionCode: "0101" }),
        aPlanCourse({ courseCode: "CMSC131", sectionCode: "0303" }),
        aSavedCourse("CMSC351"),
        // Cancelled: the catalog no longer lists it, but the course room stays.
        aPlanCourse({ courseCode: "ENGL101", sectionCode: "0999" }),
        // Gone from the catalog altogether.
        aPlanCourse({ courseCode: "MATH140", sectionCode: "0101" }),
      ],
    });
    expect(myRooms(plan, index).map((r) => r.id)).toEqual([
      "202701:SOCY411",
      "202701:CMSC131",
      "202701:CMSC131:P:pedram-sadeghian",
      "202701:CMSC131:0303",
      "202701:ENGL101",
    ]);
    expect(myRooms({ ...plan, termId: "202608" }, index)).toEqual([]);
  });
});
