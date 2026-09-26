import type { CatalogIndex } from "../catalog/catalog-index";
import { sameMeeting } from "../catalog/plan-diff";
import {
  collapsedGroupKey,
  groupSectionsByInstructor,
  groupSectionsByTime,
  type InstructorGroup,
  lectureKey,
  type SectionCountSize,
  sectionCountSize,
  sharedMeetings,
} from "../catalog/section-groups";
import {
  type Course,
  type CourseCode,
  courseRoomId,
  type InstructorName,
  lectureRoomId,
  type Meeting,
  type Plan,
  type RoomId,
  type RoomKind,
  type Section,
  type SectionCode,
  sectionRoomId,
  type TermId,
} from "../schema";
import {
  countWords,
  courseRoomDescription,
  dotJoin,
  instructorsWords,
  lectureRoomDescription,
  placeWords,
  rangeWords,
  sectionCodesWords,
  sectionRoomDescription,
  startWords,
} from "./words";

// Chat's rooms, derived from the catalog (Chat canvas, Structure board). Nobody
// creates a room and nothing is stored for one until its first message, so a
// course's chat looks exactly like its section list in course details:
// 1. every course has a course room, and with one section that's the only room;
// 2. with two or more sections, every section gets a room;
// 3. lecture rooms sit between them only when a lecture is shared by 2+
//    sections and the course has 2+ lectures (one shared lecture: the course
//    room is the lecture room);
// 4. the list groups rooms like course details: by instructor in section
//    order, or by meeting time when one group would hold every section of a
//    many-section course.

export type Room = {
  readonly id: RoomId;
  readonly kind: RoomKind;
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** Whose room it is: every section for the course room, the sharing sections for a lecture room, one for a section room. Section order. */
  readonly sectionCodes: readonly SectionCode[];
  /** The room above it: the course room, or a section's lecture room. null for the course room. */
  readonly parent: RoomId | null;
  /** The part set in mono: the course code, the section code, or null for a lecture room. */
  readonly code: string | null;
  /** The words after the code: "everyone", "TuTh 11am discussion", "Sadeghian · MWF 11am lecture". Empty when the code says it all. */
  readonly words: string;
  /** `code` and `words`, " · " between: "0303 · TuTh 11am discussion". */
  readonly label: string;
  /** The second line: where it meets, and for a lecture room which sections share it ("IRB 0324 · 0301–0305"). May be empty. */
  readonly detail: string;
  /** Who's in it, in a sentence: "People in section 0101 of CMSC131, from their plans". */
  readonly description: string;
};

/** A row in the room list, and the section rooms indented under it (only under a lecture room). */
export type RoomNode = {
  readonly room: Room;
  readonly children: readonly Room[];
};

/** A list heading (not a room), as course details groups sections. */
export type RoomGroup = {
  /** Course details' group key: `CMSC131|Pedram Sadeghian`, `ENGL101|time|<signature>`, `ENGL101|time|none`. */
  readonly key: string;
  readonly by: "instructor" | "time";
  /** "Pedram Sadeghian", "Instructor TBA", "MWF 10am", "No set times". */
  readonly title: string;
  /** "2 lectures · 10 sections", "MWF 10am lecture · 4 sections", "6 sections". */
  readonly summary: string;
  /** The group's instructors; empty for TBA and for time groups. */
  readonly instructors: readonly InstructorName[];
  /**
   * In section order of each row's first section. A lecture shared across
   * two groups (rare) is listed in the first; its sections in the other
   * group are rows of their own, still with the lecture as `parent`.
   */
  readonly nodes: readonly RoomNode[];
};

export type RoomTree = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** One, a few or many sections (DESIGN §5). Past `MANY_SECTIONS`, groups start collapsed and yours are pinned. */
  readonly size: SectionCountSize;
  readonly course: Room;
  /** In section order of each lecture's first section. */
  readonly lectures: readonly Room[];
  /** Section order; empty for a one-section course. */
  readonly sections: readonly Room[];
  /** Empty for a one-section course. */
  readonly groups: readonly RoomGroup[];
  /** Every room once, in list order: the course room, then each group's rows. */
  readonly rooms: readonly Room[];
  readonly byId: ReadonlyMap<RoomId, Room>;
};

const isLectureLike = (m: Meeting) =>
  m.kind !== "discussion" && m.kind !== "lab";

/**
 * Many sections that would all land in one instructor group group by meeting
 * time instead, like course details (ENGL101: 92 sections, all TBA).
 */
export function groupsRoomsByTime(
  course: Course,
  byInstructor: readonly InstructorGroup[] = groupSectionsByInstructor(course),
): boolean {
  return (
    sectionCountSize(course.sections.length) === "many" &&
    byInstructor.length === 1
  );
}

type Lecture = {
  readonly room: Room;
  readonly shared: readonly Meeting[];
  /** `startWords` of the lecture meetings, with "lecture": "MWF 11am lecture". */
  readonly when: string;
};

function lectures(
  termId: TermId,
  course: Course,
  order: readonly SectionCode[],
): Map<SectionCode, Lecture> {
  const byKey = new Map<string, Section[]>();
  for (const section of course.sections) {
    const key = lectureKey(section);
    const list = byKey.get(key);
    if (list) list.push(section);
    else byKey.set(key, [section]);
  }
  const bySection = new Map<SectionCode, Lecture>();
  // One lecture for the whole course: the course room is the lecture room.
  if (byKey.size < 2) return bySection;
  for (const sections of byKey.values()) {
    const [first] = sections;
    if (!first || sections.length < 2) continue;
    const meetings = first.meetings.filter(isLectureLike);
    // Async online sections share an "untimed online" key, and sections with
    // only discussions share "": neither is a lecture anyone attends together.
    if (!meetings.some((m) => m.timed)) continue;
    const codes = sections.map((s) => s.code);
    const who = instructorsWords(commonInstructors(sections));
    const when = `${startWords(meetings, { kinds: false })} lecture`;
    const room: Room = {
      id: lectureRoomId(termId, course.code, first.code),
      kind: "lecture",
      termId,
      courseCode: course.code,
      sectionCodes: codes,
      parent: courseRoomId(termId, course.code),
      code: null,
      words: dotJoin(who, when),
      label: dotJoin(who, when),
      detail: dotJoin(placeWords(meetings), sectionCodesWords(codes, order)),
      description: lectureRoomDescription(
        course.code,
        sectionCodesWords(codes, order),
        who ? `${who}'s ${when}` : `the ${when}`,
      ),
    };
    const lecture = { room, shared: sharedMeetings(sections), when };
    for (const code of codes) bySection.set(code, lecture);
  }
  return bySection;
}

/** Instructors every one of `sections` lists, in the first section's order. */
function commonInstructors(sections: readonly Section[]): InstructorName[] {
  const [first, ...others] = sections;
  if (!first) return [];
  return first.instructors.filter((name) =>
    others.every((s) => s.instructors.includes(name)),
  );
}

function sectionRoom(
  termId: TermId,
  course: Course,
  section: Section,
  parent: RoomId,
  shared: readonly Meeting[],
): Room {
  // Like course details' rows: a meeting the room above already names isn't repeated.
  const rest = section.meetings.filter(
    (m) => !shared.some((s) => sameMeeting(m, s)),
  );
  const words = startWords(rest);
  return {
    id: sectionRoomId(termId, course.code, section.code),
    kind: "section",
    termId,
    courseCode: course.code,
    sectionCodes: [section.code],
    parent,
    code: section.code,
    words,
    label: dotJoin(section.code, words),
    detail: placeWords(rest),
    description: sectionRoomDescription(course.code, section.code),
  };
}

function nodesFor(
  sections: readonly Section[],
  roomOf: ReadonlyMap<SectionCode, Room>,
  lectureOf: ReadonlyMap<SectionCode, Lecture>,
  listed: Set<RoomId>,
): RoomNode[] {
  const nodes: { room: Room; children: Room[] }[] = [];
  const here = new Map<RoomId, Room[]>();
  for (const section of sections) {
    const room = roomOf.get(section.code);
    if (!room) continue;
    const lecture = lectureOf.get(section.code)?.room;
    const siblings = lecture ? here.get(lecture.id) : undefined;
    if (siblings) siblings.push(room);
    else if (lecture && !listed.has(lecture.id)) {
      const children = [room];
      listed.add(lecture.id);
      here.set(lecture.id, children);
      nodes.push({ room: lecture, children });
    } else nodes.push({ room, children: [] });
  }
  return nodes;
}

function groupSummary(
  nodes: readonly RoomNode[],
  sectionCount: number,
  lectureOf: ReadonlyMap<SectionCode, Lecture>,
): string {
  const sections = countWords(sectionCount, "section");
  const lectureNodes = nodes.filter((n) => n.room.kind === "lecture");
  const [only] = lectureNodes;
  if (lectureNodes.length > 1)
    return dotJoin(countWords(lectureNodes.length, "lecture"), sections);
  if (only && only.children.length === sectionCount) {
    const code = only.room.sectionCodes[0];
    const when = code === undefined ? "" : (lectureOf.get(code)?.when ?? "");
    return dotJoin(when, sections);
  }
  return sections;
}

function build(termId: TermId, course: Course): RoomTree {
  const n = course.sections.length;
  const size = sectionCountSize(n);
  const order = course.sections.map((s) => s.code);
  const courseId = courseRoomId(termId, course.code);
  const lectureOf = lectures(termId, course, order);
  const lectureCount = new Set([...lectureOf.values()].map((l) => l.room.id))
    .size;
  const one = n <= 1;
  const courseRoom: Room = {
    id: courseId,
    kind: "course",
    termId,
    courseCode: course.code,
    sectionCodes: order,
    parent: null,
    code: course.code,
    words: one ? "" : "everyone",
    label: one ? course.code : `${course.code} · everyone`,
    detail: one
      ? oneSectionDetail(course.sections[0])
      : dotJoin(
          countWords(n, "section"),
          lectureCount > 0 ? countWords(lectureCount, "lecture") : "",
        ),
    description: courseRoomDescription(course.code, n),
  };
  if (one)
    return {
      termId,
      courseCode: course.code,
      size,
      course: courseRoom,
      lectures: [],
      sections: [],
      groups: [],
      rooms: [courseRoom],
      byId: new Map([[courseId, courseRoom]]),
    };

  // With one lecture for every section, that lecture is said in the course room.
  const courseShared = sharedMeetings(course.sections);
  const sections = course.sections.map((section) => {
    const lecture = lectureOf.get(section.code);
    return lecture
      ? sectionRoom(termId, course, section, lecture.room.id, lecture.shared)
      : sectionRoom(termId, course, section, courseId, courseShared);
  });
  const roomOf = new Map(sections.map((r, i) => [order[i] ?? "", r]));

  const listed = new Set<RoomId>();
  const group = (
    g: Omit<RoomGroup, "nodes" | "summary">,
    members: readonly Section[],
  ): RoomGroup => {
    const nodes = nodesFor(members, roomOf, lectureOf, listed);
    return {
      ...g,
      summary: groupSummary(nodes, members.length, lectureOf),
      nodes,
    };
  };

  const byInstructor = groupSectionsByInstructor(course);
  const groups: RoomGroup[] = [];
  if (groupsRoomsByTime(course, byInstructor)) {
    for (const t of groupSectionsByTime(course)) {
      const first = t.sections[0];
      groups.push(
        group(
          {
            key: `${course.code}|time|${t.signature}`,
            by: "time",
            title: first
              ? startWords(
                  first.meetings.filter((m) => m.timed),
                  {
                    kinds: false,
                  },
                )
              : "",
            instructors: [],
          },
          t.sections,
        ),
      );
    }
    const untimed = course.sections.filter(
      (s) => !s.meetings.some((m) => m.timed),
    );
    if (untimed.length > 0)
      groups.push(
        group(
          {
            key: `${course.code}|time|none`,
            by: "time",
            title: "No set times",
            instructors: [],
          },
          untimed,
        ),
      );
  } else {
    for (const g of byInstructor)
      groups.push(
        group(
          {
            key: collapsedGroupKey(course.code, g),
            by: "instructor",
            title: g.name || "Instructor TBA",
            instructors: g.instructors,
          },
          g.sections,
        ),
      );
  }

  const rooms: Room[] = [courseRoom];
  for (const g of groups)
    for (const node of g.nodes) rooms.push(node.room, ...node.children);
  const lectureRooms = [
    ...new Map(
      [...lectureOf.values()].map((l) => [l.room.id, l.room]),
    ).values(),
  ];
  return {
    termId,
    courseCode: course.code,
    size,
    course: courseRoom,
    lectures: lectureRooms,
    sections,
    groups,
    rooms,
    byId: new Map(rooms.map((r) => [r.id, r])),
  };
}

/** "Rendall · MW 2–3:15pm · SQH 1111": the one section, since it's the class. */
function oneSectionDetail(section: Section | undefined): string {
  if (!section) return "";
  const when = rangeWords(section.meetings) || startWords(section.meetings);
  return dotJoin(
    instructorsWords(section.instructors),
    when,
    placeWords(section.meetings),
  );
}

// Catalog objects are never mutated (core README), so trees are cached per course.
const cache = new WeakMap<Course, Map<TermId, RoomTree>>();

/** A course's rooms, their words, and how the room list groups them. */
export function roomsForCourse(termId: TermId, course: Course): RoomTree {
  let byTerm = cache.get(course);
  if (!byTerm) {
    byTerm = new Map();
    cache.set(course, byTerm);
  }
  const hit = byTerm.get(termId);
  if (hit) return hit;
  const tree = build(termId, course);
  byTerm.set(termId, tree);
  return tree;
}

/**
 * The rooms a section's people are in, widest first: the course room, then
 * the section's lecture room and its own room when the course has them.
 * Just the course room for a code the course doesn't list.
 */
export function roomsForSection(
  tree: RoomTree,
  sectionCode: SectionCode,
): Room[] {
  const own = tree.byId.get(
    sectionRoomId(tree.termId, tree.courseCode, sectionCode),
  );
  if (!own) return [tree.course];
  const path: Room[] = [];
  for (let room: Room | undefined = own; room; ) {
    path.unshift(room);
    room = room.parent === null ? undefined : tree.byId.get(room.parent);
  }
  return path;
}

/**
 * A plan's rooms, in plan order: for each placed section, its course room,
 * lecture room and section room. Saved-for-later courses have none. A
 * section the catalog no longer lists (cancelled) keeps its course room.
 */
export function myRooms(plan: Plan, index: CatalogIndex): Room[] {
  if (plan.termId !== index.termId) return [];
  const out: Room[] = [];
  for (const entry of plan.courses) {
    if (entry.sectionCode === null) continue;
    const course = index.courses.get(entry.courseCode);
    if (!course) continue;
    out.push(
      ...roomsForSection(
        roomsForCourse(index.termId, course),
        entry.sectionCode,
      ),
    );
  }
  return out;
}
