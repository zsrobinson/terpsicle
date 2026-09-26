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
  groupsRoomsByTime,
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
    lines.push(`# ${g.title} · ${g.summary}  {${g.key}}`);
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

  it("has no lecture layer when no two sections share a lecture (CMSC351)", async () => {
    const tree = roomsForCourse(TERM, cmsc351);
    expect(tree.lectures).toEqual([]);
    expect(tree.rooms).toHaveLength(1 + 4);
    expect(tree.groups.map((g) => g.title)).toEqual([
      "Ting Jiang",
      "Clyde Kruskal",
    ]);
    expect(tree.sections.map((r) => r.label)).toEqual([
      "0101 · MWF 10am",
      "0201 · MWF 2pm",
      "0301 · MWF 11am",
      "0401 · MWF 12pm",
    ]);
    expect(tree.sections.every((r) => r.parent === tree.course.id)).toBe(true);
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/cmsc351.txt");
  });

  it("puts lecture rooms between the course and its discussions (CMSC131)", async () => {
    const tree = roomsForCourse(TERM, cmsc131);
    expect(tree.rooms).toHaveLength(1 + 5 + 20);
    expect(tree.course.detail).toBe("20 sections · 5 lectures");
    expect(tree.lectures.map((r) => r.label)).toEqual([
      "Gonzalez · MWF 10am lecture",
      "Burkhauser · MWF 1pm lecture",
      "Sadeghian · MWF 11am lecture",
      "Sadeghian · MWF 12pm lecture",
      "Kyei-Asare · TuTh 6pm lecture",
    ]);
    const sadeghian = tree.groups[2];
    expect(sadeghian?.title).toBe("Pedram Sadeghian");
    expect(sadeghian?.summary).toBe("2 lectures · 10 sections");
    expect(tree.groups[0]?.summary).toBe("MWF 10am lecture · 4 sections");
    const eleven = sadeghian?.nodes[0];
    expect(eleven?.room).toMatchObject({
      id: "202608:CMSC131:L:0301",
      detail: "IRB 0324 · 0301–0305",
      description:
        "People in sections 0301–0305 of CMSC131, from their plans. They share Sadeghian's MWF 11am lecture.",
    });
    // The lecture is said once, in its room; each section names only its own discussion.
    expect(eleven?.children.map((r) => r.label)).toEqual([
      "0301 · TuTh 9:30am discussion",
      "0302 · TuTh 9:30am discussion",
      "0303 · TuTh 11am discussion",
      "0304 · TuTh 11am discussion",
      "0305 · TuTh 12:30pm discussion",
    ]);
    expect(eleven?.children[2]).toMatchObject({
      id: "202608:CMSC131:0303",
      parent: "202608:CMSC131:L:0301",
      detail: "CSI 1121",
      description: "People in section 0303 of CMSC131, from their plans",
    });
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/cmsc131.txt");
  });

  it("groups many TBA sections by meeting time, with no middle layer (ENGL101)", async () => {
    const tree = roomsForCourse(TERM, engl101);
    expect(engl101.sections).toHaveLength(92);
    expect(tree.size).toBe("many");
    expect(tree.lectures).toEqual([]);
    expect(tree.rooms).toHaveLength(93);
    expect(tree.groups.every((g) => g.by === "time")).toBe(true);
    expect(tree.groups.slice(0, 3).map((g) => [g.title, g.summary])).toEqual([
      ["MWF 8am", "1 section"],
      ["MWF 9am", "5 sections"],
      ["MWF 10am", "6 sections"],
    ]);
    const last = tree.groups.at(-1);
    expect(last?.title).toBe("No set times");
    expect(last?.nodes.map((n) => n.room.label)).toEqual([
      "0506 · online, no set time",
      "0507 · online, no set time",
    ]);
    expect(tree.sections[2]).toMatchObject({
      label: "0103 · MWF 9am",
      detail: "TWS 1641",
    });
    await expect(outline(tree)).toMatchFileSnapshot("__fixtures__/engl101.txt");
  });
});

describe("roomsForCourse: edge cases", () => {
  it("makes the course room the lecture room when every section shares one lecture", () => {
    const shared = lecture(MWF, 600);
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: lectureSections("01", "Ada Brandt", shared, [
          [["Tu"], 540, "2120"],
          [["Tu"], 600, "2120"],
          [["Th"], 540, "2120"],
        ]),
      }),
    );
    expect(tree.lectures).toEqual([]);
    expect(tree.sections.map((r) => r.label)).toEqual([
      "0101 · Tu 9am discussion",
      "0102 · Tu 10am discussion",
      "0103 · Th 9am discussion",
    ]);
    expect(tree.groups[0]?.summary).toBe("3 sections");
  });

  it("never makes async online sections a lecture room, though they share a key", () => {
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: [
          section("0101", ["Ada Brandt"], [lecture(MWF, 600)]),
          section("0102", ["Ada Brandt"], [lecture(MWF, 600)]),
          section("0201", ["Ada Brandt"], [anUntimedMeeting()]),
          section("0202", ["Ada Brandt"], [anUntimedMeeting()]),
          section("0203", ["Ada Brandt"], [anUntimedMeeting()]),
        ],
      }),
    );
    expect(tree.lectures.map((r) => r.id)).toEqual(["202608:CMSC351:L:0101"]);
    expect(tree.sections.slice(2).map((r) => r.parent)).toEqual([
      "202608:CMSC351",
      "202608:CMSC351",
      "202608:CMSC351",
    ]);
  });

  it("lists a lecture shared across instructor groups once, and keeps every section in its group", () => {
    const shared = lecture(TUTH, 570);
    const tree = roomsForCourse(
      TERM,
      aCourse({
        sections: [
          section(
            "0101",
            ["Ada Brandt"],
            [shared, discussion(["M"], 600, "1")],
          ),
          section("0102", ["Lee Moss"], [shared, discussion(["W"], 600, "1")]),
          section("0201", ["Ada Brandt"], [lecture(MWF, 780)]),
        ],
      }),
    );
    const [brandt, moss] = tree.groups;
    expect(brandt?.nodes.map((n) => n.room.label)).toEqual([
      "TuTh 9:30am lecture",
      "0201 · MWF 1pm",
    ]);
    expect(brandt?.nodes[0]?.children.map((r) => r.id)).toEqual([
      "202608:CMSC351:0101",
    ]);
    // Nobody teaches both, so the lecture room names nobody.
    expect(tree.lectures[0]?.description).toBe(
      "People in sections 0101 and 0102 of CMSC351, from their plans. They share the TuTh 9:30am lecture.",
    );
    expect(moss?.nodes.map((n) => [n.room.id, n.room.parent])).toEqual([
      ["202608:CMSC351:0102", "202608:CMSC351:L:0101"],
    ]);
    expect(tree.rooms.map((r) => r.id)).toEqual([
      "202608:CMSC351",
      "202608:CMSC351:L:0101",
      "202608:CMSC351:0101",
      "202608:CMSC351:0201",
      "202608:CMSC351:0102",
    ]);
  });

  it("names a section by all its meetings when it shares nothing, and says so when it has none", () => {
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

  it("groups by instructor, not time, when many sections have 2+ instructors", () => {
    const course = aCourse({
      sections: Array.from({ length: MANY_SECTIONS + 1 }, (_, i) =>
        section(
          `01${String(i + 10)}`,
          [i % 2 ? "Lee Moss" : "Ada Brandt"],
          [lecture(MWF, 480 + i * 30)],
        ),
      ),
    });
    expect(groupsRoomsByTime(course)).toBe(false);
    expect(roomsForCourse(TERM, course).groups.map((g) => g.by)).toEqual([
      "instructor",
      "instructor",
    ]);
    expect(groupsRoomsByTime(engl101)).toBe(true);
    expect(groupsRoomsByTime(cmsc131)).toBe(false);
  });
});

describe("room ids", () => {
  it("are built from codes, so a time or room change keeps them (and renames the room)", () => {
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
    expect(after.byId.get("202608:CMSC131:L:0301")?.label).toBe(
      "Sadeghian · MWF 11:30am lecture",
    );
    expect(after.byId.get("202608:CMSC131:0303")?.detail).toBe("CSI 0115");
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
      "202608:CMSC131:L:0301",
    );
  });

  it("differ by term, parse back, and are unique across the mock catalog", () => {
    expect(roomsForCourse("202701", cmsc351).course.id).toBe("202701:CMSC351");
    for (const course of mockCourses()) {
      const tree = roomsForCourse(fixtureTermId, course);
      const ids = tree.rooms.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of tree.rooms) {
        expect(RoomIdSchema.safeParse(r.id).success).toBe(true);
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
  it("lists every section once, under a parent that exists", () => {
    for (const course of mockCourses()) {
      const tree = roomsForCourse(fixtureTermId, course);
      const n = course.sections.length;
      if (n <= 1) {
        expect(tree.rooms).toEqual([tree.course]);
        continue;
      }
      expect(tree.sections).toHaveLength(n);
      expect(tree.rooms).toHaveLength(1 + tree.lectures.length + n);
      const listed = tree.groups.flatMap((g) =>
        g.nodes.flatMap((node) => [node.room, ...node.children]),
      );
      expect(listed).toEqual(tree.rooms.slice(1));
      for (const r of tree.rooms.slice(1)) {
        expect(r.parent && tree.byId.get(r.parent), r.id).toBeTruthy();
        expect(r.label, r.id).not.toMatch(/ · $|^ · /);
      }
      for (const l of tree.lectures)
        expect(l.sectionCodes.length, l.id).toBeGreaterThan(1);
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
      "Sadeghian · MWF 11am lecture",
      "0303 · TuTh 11am discussion",
    ]);
    expect(
      roomsForSection(roomsForCourse(TERM, cmsc351), "0201").map((r) => r.id),
    ).toEqual(["202608:CMSC351", "202608:CMSC351:0201"]);
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
      "202701:CMSC131:L:0301",
      "202701:CMSC131:0303",
      "202701:ENGL101",
    ]);
    expect(myRooms({ ...plan, termId: "202608" }, index)).toEqual([]);
  });
});
