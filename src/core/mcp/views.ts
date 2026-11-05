import { gradeSummary } from "../grades/grades";
import {
  type Course,
  type CourseGrades,
  GEN_ED_LABELS,
  type GenEdGroup,
  GRADE_KEYS,
  type GradeRecord,
  type Instructor,
  instructorNameKey,
  type Meeting,
  type PlanetTerpDept,
  type SeatTuple,
  type Section,
  seatCountsFromTuple,
  sectionKey,
  type TermId,
} from "../schema";
import { type SeatsMap, seatStatus } from "../seats";
import { formatDateSpan, formatDays, formatTimeRange } from "../time/format";
import { termRef } from "./terms";

// What the MCP server's tools answer with (docs/MCP.md): Testudo's and
// PlanetTerp's data shaped for an agent to read. Plain words over codes
// where a person would read them ("MWF 10am–10:50am, IRB 0324"), flat
// objects, nothing an agent doesn't need, and every field that can be
// unknown says so with null rather than leaving it out.

/** "MWF 10am–10:50am · IRB 0324 · discussion"; "Online, no set times"; "TBA". */
export function meetingText(meeting: Meeting): string {
  const where = meeting.online
    ? "online"
    : meeting.building
      ? [meeting.building, meeting.room].filter(Boolean).join(" ")
      : "room TBA";
  const kind = meeting.kind === "lecture" ? [] : [meeting.kind];
  if (!meeting.timed)
    return [
      meeting.online ? "Online, no set times" : "Times TBA",
      ...(meeting.online ? [] : [where]),
      ...kind,
    ].join(" · ");
  return [
    `${formatDays(meeting.days)} ${formatTimeRange(meeting.start, meeting.end)}`,
    where,
    ...kind,
  ].join(" · ");
}

const DELIVERY_WORDS = {
  f2f: "in person",
  blended: "blended",
  "online-sync": "online, live",
  "online-async": "online, on your own time",
} as const;

export type SeatsView = {
  /** The scheduler's words: "12 of 36 open", "2 left", "Full · 9 waitlisted". */
  status: string;
  open: number;
  total: number;
  waitlist: number | null;
  holdfile: number | null;
};

export function seatsView(tuple: SeatTuple | undefined): SeatsView | null {
  if (!tuple) return null;
  const counts = seatCountsFromTuple(tuple);
  return { ...counts, status: seatStatus(counts).words };
}

/** An instructor as a section or a course names them, with PlanetTerp's numbers when the join found them. */
export type InstructorRef = {
  name: string;
  /** PlanetTerp's slug, for get_instructor; null when PlanetTerp doesn't know them. */
  slug: string | null;
  /** PlanetTerp's average rating, 1–5; null with no reviews. */
  rating: number | null;
  reviews: number;
};

export function instructorRef(
  name: string,
  dept: PlanetTerpDept | null,
): InstructorRef {
  const slug = dept?.names[instructorNameKey(name)] ?? null;
  const known: Instructor | undefined = slug
    ? dept?.instructors[slug]
    : undefined;
  return {
    name,
    slug,
    rating:
      known?.rating === null || known?.rating === undefined
        ? null
        : round(known.rating, 2),
    reviews: known?.reviewCount ?? 0,
  };
}

export type SectionView = {
  section: string;
  /** `CMSC351-0101`: what check_schedule takes. */
  key: string;
  instructors: InstructorRef[];
  delivery: string;
  meetings: string[];
  /** Null when Testudo shows no counts for it. */
  seats: SeatsView | null;
  /** Non-standard dates ("Jun 1 – Jul 10"); null for the term's own. */
  dates: string | null;
  restriction: string | null;
  notes: string | null;
};

export function sectionView(
  course: Pick<Course, "code">,
  section: Section,
  seats: SeatsMap | null,
  dept: PlanetTerpDept | null,
): SectionView {
  const key = sectionKey(course.code, section.code);
  return {
    section: section.code,
    key,
    instructors: section.instructors.map((n) => instructorRef(n, dept)),
    delivery: DELIVERY_WORDS[section.delivery],
    meetings:
      section.meetings.length > 0
        ? section.meetings.map(meetingText)
        : ["Contact the department or instructor for times"],
    seats: seatsView(seats?.[key]),
    dates: section.dates ? formatDateSpan(section.dates) : null,
    restriction: section.restriction,
    notes: section.notes,
  };
}

/** "DSHU or DSHS" per group, each code with its name: every group applies. */
export function genEdWords(groups: readonly GenEdGroup[]): string[] {
  return groups.map((group) =>
    group
      .map((o) => {
        const label = GEN_ED_LABELS[o.code];
        const name = label ? `${o.code} (${label})` : o.code;
        return o.condition ? `${name} ${o.condition}` : name;
      })
      .join(" or "),
  );
}

export type GradesView = {
  /** A+ through F, on a 4.0 scale; W and Other left out, as PlanetTerp counts. */
  averageGpa: number | null;
  /** Share of letter grades that were an A or B, 0–100. */
  percentAOrB: number | null;
  /** Everyone in the data, W and Other included. */
  students: number;
  percentW: number | null;
  semesters: number;
  latestTerm: { id: TermId; name: string };
};

export function gradesView(record: GradeRecord): GradesView {
  const summary = gradeSummary(record.counts);
  const w = record.counts[GRADE_KEYS.indexOf("W")] ?? 0;
  return {
    averageGpa:
      summary.averageGpa === null ? null : round(summary.averageGpa, 2),
    percentAOrB:
      summary.aOrBShare === null ? null : Math.round(summary.aOrBShare * 100),
    students: summary.students,
    percentW:
      summary.students > 0 ? Math.round((w / summary.students) * 100) : null,
    semesters: record.semesters,
    latestTerm: termRef(record.latestTermId),
  };
}

export type InstructorGrades = GradesView & {
  slug: string;
  name: string;
  rating: number | null;
  reviews: number;
};

/** A course's grades by instructor, most students first; `limit` of them. */
export function gradesByInstructor(
  grades: CourseGrades | undefined,
  dept: PlanetTerpDept | null,
  limit: number,
): InstructorGrades[] {
  if (!grades) return [];
  return Object.entries(grades.byInstructor)
    .map(([slug, record]) => {
      const known = dept?.instructors[slug];
      return {
        slug,
        name: known?.name ?? slug,
        rating:
          known?.rating === null || known?.rating === undefined
            ? null
            : round(known.rating, 2),
        reviews: known?.reviewCount ?? 0,
        ...gradesView(record),
      };
    })
    .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** A term's sections of a course, summed: how many, how many have seats, and who teaches. */
export function termSummary(
  course: Course,
  seats: SeatsMap | null,
  dept: PlanetTerpDept | null,
): {
  sections: number;
  sectionsWithOpenSeats: number | null;
  openSeats: number | null;
  instructors: InstructorRef[];
} {
  let known = 0;
  let open = 0;
  let withSeats = 0;
  const names = new Set<string>();
  for (const section of course.sections) {
    for (const n of section.instructors) names.add(n);
    const tuple = seats?.[sectionKey(course.code, section.code)];
    if (!tuple) continue;
    known += 1;
    open += tuple[0];
    if (tuple[0] > 0) withSeats += 1;
  }
  return {
    sections: course.sections.length,
    sectionsWithOpenSeats: known > 0 ? withSeats : null,
    openSeats: known > 0 ? open : null,
    instructors: [...names].sort().map((n) => instructorRef(n, dept)),
  };
}

/** "Clyde Kruskal (2.6★, 112 reviews)": an instructor in one line. */
export function instructorWords(ref: InstructorRef): string {
  if (ref.rating === null) return ref.name;
  return `${ref.name} (${ref.rating.toFixed(1)}★, ${ref.reviews} ${ref.reviews === 1 ? "review" : "reviews"})`;
}
