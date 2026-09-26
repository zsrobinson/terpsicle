import type { CatalogIndex } from "../catalog/catalog-index";
import {
  bySectionCode,
  collapsedGroupKey,
  groupSectionsByInstructor,
  hasGroupHeaders,
  type SectionCountSize,
  sectionCountSize,
} from "../catalog/section-groups";
import {
  type Course,
  type CourseCode,
  courseRoomId,
  type InstructorName,
  type Plan,
  professorRoomId,
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
  placeWords,
  professorRoomDescription,
  rangeWords,
  sectionCodesWords,
  sectionRoomDescription,
  startWords,
} from "./words";

// Chat's rooms, derived from the catalog (Chat canvas, Structure board). Nobody
// creates a room and nothing is stored for one until its first message, so a
// course's chat looks exactly like its section list in course details, with
// one level of grouping (V2.md §8.1):
// 1. every course has a course room, and with one section that's the only room;
// 2. with two or more sections, every section gets a room;
// 3. with more than one professor, each named professor gets a room between
//    the course and their sections. TBA sections sit right under the course.

export type Room = {
  readonly id: RoomId;
  readonly kind: RoomKind;
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** Whose room it is: every section for the course room, the professor's for a professor room, one for a section room. Section-code order. */
  readonly sectionCodes: readonly SectionCode[];
  /** The room above it: the course room, or a section's professor room. null for the course room. */
  readonly parent: RoomId | null;
  /** The part set in mono: the course code, the section code, or null for a professor room. */
  readonly code: string | null;
  /** The words after the code: "everyone", "MWF 10am and Tu 8am discussion", "Sadeghian's sections". Empty when the code says it all. */
  readonly words: string;
  /** `code` and `words`, " · " between: "0303 · MWF 11am and TuTh 11am discussion". */
  readonly label: string;
  /** The second line: where it meets, or for a professor room how many sections ("IRB 0324, CSI 1121", "10 sections"). May be empty. */
  readonly detail: string;
  /** Who's in it, in a sentence: "People in section 0101 of CMSC131, from their plans". */
  readonly description: string;
};

/** A row in the room list, and the section rooms indented under it (only under a professor room). */
export type RoomNode = {
  readonly room: Room;
  readonly children: readonly Room[];
};

/** A list heading (not a room), as course details groups sections: one per professor. */
export type RoomGroup = {
  /** Course details' group key: `CMSC131|Pedram Sadeghian`, `CMSC131|` for TBA. */
  readonly key: string;
  /** "Pedram Sadeghian", "Instructor TBA". */
  readonly title: string;
  /** "10 sections". */
  readonly summary: string;
  /** Empty for TBA. */
  readonly instructors: readonly InstructorName[];
  /** False when the course has one professor: like course details, the list shows no heading. */
  readonly heading: boolean;
  /** The professor's room with their sections under it, or (one professor, or TBA) the section rooms themselves. */
  readonly nodes: readonly RoomNode[];
};

export type RoomTree = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** One, a few or many sections (DESIGN §5). Past `MANY_SECTIONS`, groups start collapsed and yours are pinned. */
  readonly size: SectionCountSize;
  readonly course: Room;
  /** In group order; empty with one professor. */
  readonly professors: readonly Room[];
  /** Section-code order; empty for a one-section course. */
  readonly sections: readonly Room[];
  /** Empty for a one-section course. */
  readonly groups: readonly RoomGroup[];
  /** Every room once, in list order: the course room, then each group's rows. */
  readonly rooms: readonly Room[];
  readonly byId: ReadonlyMap<RoomId, Room>;
};

function sectionRoom(
  termId: TermId,
  course: Course,
  section: Section,
  parent: RoomId,
): Room {
  // Every meeting, like course details' rows: nothing above says them.
  const words = startWords(section.meetings);
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
    detail: placeWords(section.meetings),
    description: sectionRoomDescription(course.code, section.code),
  };
}

function build(termId: TermId, course: Course): RoomTree {
  const n = course.sections.length;
  const size = sectionCountSize(n);
  const ordered = [...course.sections].sort(bySectionCode);
  const order = ordered.map((s) => s.code);
  const courseId = courseRoomId(termId, course.code);
  const groups = groupSectionsByInstructor(course);
  const headed = hasGroupHeaders(groups);
  const professorCount = headed
    ? groups.filter((g) => g.instructors.length > 0).length
    : 0;
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
          professorCount > 0 ? countWords(professorCount, "professor") : "",
        ),
    description: courseRoomDescription(course.code, n),
  };
  if (one)
    return {
      termId,
      courseCode: course.code,
      size,
      course: courseRoom,
      professors: [],
      sections: [],
      groups: [],
      rooms: [courseRoom],
      byId: new Map([[courseId, courseRoom]]),
    };

  const professors: Room[] = [];
  const roomGroups: RoomGroup[] = groups.map((g) => {
    const codes = g.sections.map((s) => s.code);
    const who = instructorsWords(g.instructors);
    // One professor: the course room is theirs. TBA: nobody to gather around.
    const professor: Room | null =
      headed && g.instructors.length > 0
        ? {
            id: professorRoomId(termId, course.code, g.instructors),
            kind: "professor",
            termId,
            courseCode: course.code,
            sectionCodes: codes,
            parent: courseId,
            code: null,
            words: `${who}'s sections`,
            label: `${who}'s sections`,
            detail: dotJoin(
              countWords(codes.length, "section"),
              sectionCodesWords(codes, order),
            ),
            description: professorRoomDescription(
              course.code,
              who,
              sectionCodesWords(codes, order),
            ),
          }
        : null;
    const sectionRooms = g.sections.map((s) =>
      sectionRoom(termId, course, s, professor?.id ?? courseId),
    );
    if (professor) professors.push(professor);
    return {
      key: collapsedGroupKey(course.code, g),
      title: g.name || "Instructor TBA",
      summary: countWords(codes.length, "section"),
      instructors: g.instructors,
      heading: headed,
      nodes: professor
        ? [{ room: professor, children: sectionRooms }]
        : sectionRooms.map((room) => ({ room, children: [] })),
    };
  });

  const rooms: Room[] = [courseRoom];
  for (const g of roomGroups)
    for (const node of g.nodes) rooms.push(node.room, ...node.children);
  const sections = rooms
    .filter((r) => r.kind === "section")
    .sort((a, b) => order.indexOf(a.code ?? "") - order.indexOf(b.code ?? ""));
  return {
    termId,
    courseCode: course.code,
    size,
    course: courseRoom,
    professors,
    sections,
    groups: roomGroups,
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
 * the section's professor room and its own room when the course has them.
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
 * professor room and section room. Bookmarked courses have none. A section
 * the catalog no longer lists (cancelled) keeps its course room.
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
