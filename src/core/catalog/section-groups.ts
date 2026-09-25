import type {
  Course,
  CourseCode,
  InstructorName,
  Section,
  SectionCode,
} from "../schema";

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
