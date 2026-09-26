import type {
  Course,
  CourseCode,
  InstructorName,
  Meeting,
  Section,
  SectionCode,
} from "../schema";
import { sameMeeting } from "./plan-diff";

// How course details and the calendar group a course's sections (SPEC §3.3–3.4).

// ---------- time-identical groups (calendar ghosts) ----------

export type TimeGroup = {
  /** Identical for sections that meet at exactly the same times. */
  readonly signature: string;
  /** Section-number order. */
  readonly sections: readonly Section[];
  /** "0101" or "0101–0106 · 6 sections". */
  readonly label: string;
};

/** The calendar draws at most this many ghosts; the sidebar lists the rest. */
export const GHOST_CAP = 12;

/** Days and times of every timed meeting, plus the section's own dates; "" when nothing is timed. */
export function timeSignature(section: Section): string {
  const parts: string[] = [];
  for (const m of section.meetings)
    if (m.timed) parts.push(`${m.days.join("")}@${m.start}-${m.end}`);
  if (parts.length === 0) return "";
  const dates = section.dates;
  if (dates) parts.push(`${dates.start}~${dates.end}`);
  return parts.sort().join(",");
}

export function timeGroupLabel(codes: readonly SectionCode[]): string {
  const first = codes[0] ?? "";
  if (codes.length <= 1) return first;
  return `${first}–${codes[codes.length - 1]} · ${codes.length} sections`;
}

/**
 * Sections with identical meeting times merged into one group, in section
 * order of each group's first section. Sections with no set times are left
 * out (they have no ghost), as are `exclude`d codes (the placed section,
 * drawn solid).
 */
export function groupSectionsByTime(
  course: Course,
  exclude: readonly SectionCode[] = [],
): TimeGroup[] {
  const groups = new Map<string, Section[]>();
  for (const section of course.sections) {
    if (exclude.includes(section.code)) continue;
    const sig = timeSignature(section);
    if (sig === "") continue;
    const list = groups.get(sig);
    if (list) list.push(section);
    else groups.set(sig, [section]);
  }
  return [...groups].map(([signature, sections]) => ({
    signature,
    sections,
    label: timeGroupLabel(sections.map((s) => s.code)),
  }));
}

/** The first `cap` groups by section order go on the calendar; the rest are listed. */
export function capGhosts<T>(
  groups: readonly T[],
  cap: number = GHOST_CAP,
): { shown: T[]; overflow: T[] } {
  return { shown: groups.slice(0, cap), overflow: groups.slice(cap) };
}

// ---------- instructor groups (course details) ----------

export type InstructorGroup = {
  /** Instructor names joined with ", "; "" for TBA. Used in collapsed-group keys. */
  readonly name: string;
  /** Empty for TBA. */
  readonly instructors: readonly InstructorName[];
  /** Section-number order. */
  readonly sections: readonly Section[];
};

/**
 * Sections grouped by who teaches them. Groups come in the order their first
 * section appears and sections keep section-number order: never re-sorted by
 * name (SPEC §3.4).
 */
export function groupSectionsByInstructor(course: Course): InstructorGroup[] {
  const groups = new Map<
    string,
    { instructors: InstructorName[]; sections: Section[] }
  >();
  for (const section of course.sections) {
    const name = section.instructors.join(", ");
    const group = groups.get(name);
    if (group) group.sections.push(section);
    else
      groups.set(name, {
        instructors: [...section.instructors],
        sections: [section],
      });
  }
  return [...groups].map(([name, g]) => ({ name, ...g }));
}

/** The `UiPrefs.collapsedGroups` entry for an instructor group. */
export function collapsedGroupKey(
  courseCode: CourseCode,
  group: Pick<InstructorGroup, "name">,
): string {
  return `${courseCode}|${group.name}`;
}

// ---------- section count (course details, search results) ----------

/**
 * How many sections a course has, as the UI treats it (DESIGN §5: design for
 * 1, a few, and many): one reads as "this is the class", a few get full rows,
 * many get one-line rows, "Only fits" and the plan's own section pinned.
 */
export type SectionCountSize = "one" | "few" | "many";

/** Past this many, a course has "many" sections. */
export const MANY_SECTIONS = 20;
/** From this many, the "Only fits" filter is offered. */
export const ONLY_FITS_FROM = 9;

export function sectionCountSize(count: number): SectionCountSize {
  if (count <= 1) return "one";
  return count > MANY_SECTIONS ? "many" : "few";
}

// ---------- shared meetings (course details rows) ----------

/** A section, and the meetings it has beyond its run's shared ones. */
export type FactoredSection = {
  readonly section: Section;
  /** In the section's own order. Empty when it has nothing but the shared meetings. */
  readonly rest: readonly Meeting[];
};

/**
 * Sections in a row that share some meetings: "All meet TuTh 9:30–10:45am
 * IRB 0324", then each section's discussion or lab.
 */
export type MeetingRun = {
  /** What every section in the run has (in the first section's order); empty when nothing is shared. */
  readonly shared: readonly Meeting[];
  readonly sections: readonly FactoredSection[];
};

const OWN_KINDS: ReadonlySet<Meeting["kind"]> = new Set(["discussion", "lab"]);

/**
 * The section's lecture-like meetings (not discussions or labs) as one key.
 * Sections with the same key share a lecture, so they share a line.
 */
export function lectureKey(section: Section): string {
  return section.meetings
    .filter((m) => !OWN_KINDS.has(m.kind))
    .map((m) =>
      [
        m.kind,
        m.timed ? `${m.days.join("")}@${m.start}-${m.end}` : "untimed",
        m.online ? "online" : `${m.building ?? ""} ${m.room ?? ""}`,
      ].join("|"),
    )
    .join(",");
}

/** Meetings every one of `sections` has, in the first section's order. */
export function sharedMeetings(sections: readonly Section[]): Meeting[] {
  const [first, ...others] = sections;
  if (!first || others.length === 0) return [];
  return first.meetings.filter((m) =>
    others.every((s) => s.meetings.some((o) => sameMeeting(m, o))),
  );
}

function run(sections: readonly Section[]): MeetingRun {
  const shared = sharedMeetings(sections);
  return {
    shared,
    sections: sections.map((section) => ({
      section,
      rest: section.meetings.filter(
        (m) => !shared.some((x) => sameMeeting(m, x)),
      ),
    })),
  };
}

/**
 * A group's sections, factored so each row shows only what differs (UX
 * review §3.4). When every section shares a meeting, that's one run. When
 * they split across lectures (one instructor teaching at 2pm and 3:30pm),
 * each run of sections with the same lecture gets its own shared line.
 * Section order never changes (SPEC §3.4): runs are consecutive, so a
 * lecture that comes back later starts a new run.
 */
export function factorMeetings(sections: readonly Section[]): MeetingRun[] {
  if (sections.length === 0) return [];
  if (sections.length === 1 || sharedMeetings(sections).length > 0)
    return [run(sections)];
  const runs: Section[][] = [];
  for (const section of sections) {
    const last = runs.at(-1);
    const head = last?.[0];
    if (last && head && lectureKey(head) === lectureKey(section))
      last.push(section);
    else runs.push([section]);
  }
  return runs.map(run);
}

// ---------- shared lectures ----------

/**
 * Sections that attend a lecture together: 2+ sections with the same
 * `lectureKey`, where that lecture has a set time. In section order of each
 * lecture's first section. Async online sections all share an "untimed
 * online" key, and discussion-only sections share "": neither is a lecture
 * anyone attends together, so neither counts.
 */
export function sharedLectures(course: Course): Section[][] {
  const byKey = new Map<string, Section[]>();
  for (const section of course.sections) {
    const key = lectureKey(section);
    const list = byKey.get(key);
    if (list) list.push(section);
    else byKey.set(key, [section]);
  }
  return [...byKey.values()].filter(
    (sections) =>
      sections.length >= 2 &&
      (sections[0]?.meetings.some((m) => m.timed && !OWN_KINDS.has(m.kind)) ??
        false),
  );
}

// ---------- how course details and Chat group sections ----------

/**
 * - `instructor`: the usual (SPEC §3.4).
 * - `time`: many sections all in one instructor group (ENGL101: 92, all TBA)
 *   would be one group of everything, so they group by meeting time, like
 *   the calendar's ghosts (UX review, decision 2).
 * - `lecture`: the same, but the sections share lectures (CHEM231: 25 TBA
 *   sections, 4 lectures). A lecture plus a discussion is unique to each
 *   section, so time groups would be one per section; the lecture is what
 *   they have in common.
 */
export type SectionGrouping = "instructor" | "time" | "lecture";

export function sectionGrouping(
  course: Course,
  byInstructor: readonly InstructorGroup[] = groupSectionsByInstructor(course),
): SectionGrouping {
  if (
    sectionCountSize(course.sections.length) !== "many" ||
    byInstructor.length !== 1
  )
    return "instructor";
  return sharedLectures(course).length >= 2 ? "lecture" : "time";
}

type GroupBase = {
  /**
   * The `UiPrefs.collapsedGroups` entry: `CMSC131|Pedram Sadeghian`,
   * `CHEM231|lecture|0101` (the lecture's first section, so a time or room
   * change keeps it), `ENGL101|time|<signature>`, `ENGL101|time|none`.
   */
  readonly key: string;
  /** Section-number order. */
  readonly sections: readonly Section[];
};

/** A heading in course details' section list, and in Chat's room list. */
export type SectionListGroup =
  | ({ readonly by: "instructor" } & InstructorGroup & GroupBase)
  | ({
      readonly by: "lecture";
      /** The lecture-like meetings every section in the group shares, in the first section's order. */
      readonly lecture: readonly Meeting[];
    } & GroupBase)
  | ({
      readonly by: "time";
      /** `timeSignature` of every section in the group; "" for sections with no set times. */
      readonly signature: string;
    } & GroupBase);

/**
 * A course's sections as course details lists them, by `sectionGrouping`.
 * Groups come in the order of their first section, except that sections
 * with no set times go last; sections keep section-number order (SPEC §3.4).
 * Under `lecture`, a section that shares no lecture gets a time group, as
 * it would under `time`.
 */
export function groupSections(course: Course): SectionListGroup[] {
  const byInstructor = groupSectionsByInstructor(course);
  const grouping = sectionGrouping(course, byInstructor);
  if (grouping === "instructor")
    return byInstructor.map((g) => ({
      by: "instructor",
      key: collapsedGroupKey(course.code, g),
      ...g,
    }));

  const order = new Map(course.sections.map((s, i) => [s.code, i]));
  const firstOf = (sections: readonly Section[]) =>
    order.get(sections[0]?.code ?? "") ?? 0;
  const timed: SectionListGroup[] = [];
  const inLecture = new Set<SectionCode>();
  if (grouping === "lecture")
    for (const sections of sharedLectures(course)) {
      const [first] = sections;
      if (!first) continue;
      for (const s of sections) inLecture.add(s.code);
      timed.push({
        by: "lecture",
        key: `${course.code}|lecture|${first.code}`,
        lecture: first.meetings.filter((m) => !OWN_KINDS.has(m.kind)),
        sections,
      });
    }
  const rest = course.sections.filter((s) => !inLecture.has(s.code));
  for (const t of groupSectionsByTime({ ...course, sections: rest }))
    timed.push({
      by: "time",
      key: `${course.code}|time|${t.signature}`,
      signature: t.signature,
      sections: t.sections,
    });
  timed.sort((a, b) => firstOf(a.sections) - firstOf(b.sections));
  const untimed = rest.filter((s) => timeSignature(s) === "");
  if (untimed.length === 0) return timed;
  return [
    ...timed,
    {
      by: "time",
      key: `${course.code}|time|none`,
      signature: "",
      sections: untimed,
    },
  ];
}
