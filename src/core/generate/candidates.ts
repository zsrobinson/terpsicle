import {
  type Block,
  type Course,
  type CourseCode,
  type MustHaves,
  type Relaxable,
  type Section,
  type SectionKey,
  sectionKey,
} from "../schema";
import { type SeatsMap, seatCounts } from "../seats/seats";
import { dayIndex } from "../time/format";
import {
  type SparseMask,
  toSparse,
  type WeekMask,
  weekMaskOf,
} from "../time/slots";
import {
  blockWeekItems,
  itemsOverlap,
  type MeetingItem,
  sectionWeekItems,
  type WeekItem,
} from "../time/week";

// Step 1–2 of the generator recipe (RESEARCH §2): each course's sections,
// checked against the must-haves, then merged when they meet at identical
// times in identical buildings (the "×3 equivalent" groups). Merging is what
// keeps a course like ENGL101, with dozens of same-time sections, tractable.

/** What the generator knows about a section beyond the catalog. */
export type SectionQuality = {
  /** Mean PlanetTerp rating of its instructors, 1–5. */
  readonly rating: number | null;
  /** Average GPA its instructors gave in this course. */
  readonly gpa: number | null;
};

export type QualityMap = ReadonlyMap<SectionKey, SectionQuality>;

/** Sections that meet at the same times in the same buildings, offered as one choice. */
export type SectionGroup = {
  readonly course: Course;
  /**
   * The representative first (the member with the most open seats: the one
   * a saved plan gets), then the rest in section-number order.
   */
  readonly sections: readonly Section[];
  /** The representative's timed meetings, one per day, in week order. */
  readonly items: readonly MeetingItem[];
  /** Each item's day as an index (Monday 0), so the search never looks days up. */
  readonly dayIndexes: Uint8Array;
  readonly mask: WeekMask;
  readonly sparse: SparseMask;
  /** The representative's open seats; null when Testudo shows no counts for it. */
  readonly openSeats: number | null;
  /** The group's best member: you can register for whichever that is. */
  readonly rating: number | null;
  readonly gpa: number | null;
  /** Must-haves every member breaks (empty for normal candidates; near-misses use the rest). */
  readonly violations: readonly Relaxable[];
};

function weekOrdered(course: Course, section: Section): MeetingItem[] {
  return [...sectionWeekItems(course.code, section)].sort(
    (a, b) => dayIndex(a.day) - dayIndex(b.day) || a.start - b.start,
  );
}

/** The must-haves one section breaks on its own (travel and credits are about combinations). */
export function sectionViolations(
  course: Course,
  section: Section,
  mustHaves: MustHaves,
  blockItems: readonly WeekItem[],
  seats: SeatsMap | null,
): Relaxable[] {
  const out: Relaxable[] = [];
  const items = sectionWeekItems(course.code, section);
  const { earliestStart, latestEnd, daysOff } = mustHaves;
  if (earliestStart !== null && items.some((i) => i.start < earliestStart))
    out.push("earliest-start");
  if (latestEnd !== null && items.some((i) => i.end > latestEnd))
    out.push("latest-end");
  if (daysOff.length > 0 && items.some((i) => daysOff.includes(i.day)))
    out.push("days-off");
  if (mustHaves.openSeatsOnly) {
    // Unknown counts pass: we can't say the section is full.
    const counts = seatCounts(seats, sectionKey(course.code, section.code));
    if (counts !== null && counts.open === 0) out.push("open-seats-only");
  }
  if (mustHaves.respectBlocks && blockItems.length > 0) {
    if (items.some((i) => blockItems.some((b) => itemsOverlap(i, b))))
      out.push("respect-blocks");
  }
  return out;
}

/** Identical for sections a student could swap without changing their week. */
export function equivalenceKey(course: Course, section: Section): string {
  const parts = section.meetings.flatMap((m) =>
    m.timed
      ? [
          `${m.days.join("")}@${m.start}-${m.end}@${m.online ? "online" : (m.building ?? "")}`,
        ]
      : [],
  );
  const dates = section.dates
    ? `${section.dates.start}~${section.dates.end}`
    : "";
  return `${course.code}|${parts.sort().join(",")}|${dates}`;
}

function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;
}

function best(values: readonly (number | null)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v !== null && (out === null || v > out)) out = v;
  return out;
}

export type CandidateOptions = {
  readonly mustHaves: MustHaves;
  readonly blocks: readonly Block[];
  readonly seats: SeatsMap | null;
  readonly quality: QualityMap;
  /** Only these section codes; null for every section. */
  readonly only: readonly string[] | null;
  /** Keep sections that break must-haves, marked (for near-misses). */
  readonly keepViolations: boolean;
};

/**
 * A course's candidate groups: sections filtered by the must-haves, then
 * merged when time-identical. Groups keep section order by their first member.
 */
export function candidateGroups(
  course: Course,
  options: CandidateOptions,
): SectionGroup[] {
  const byKey = new Map<
    string,
    { sections: Section[]; violations: Relaxable[] }
  >();
  const blockItems = options.blocks.flatMap(blockWeekItems);
  for (const section of course.sections) {
    if (options.only && !options.only.includes(section.code)) continue;
    const violations = sectionViolations(
      course,
      section,
      options.mustHaves,
      blockItems,
      options.seats,
    );
    if (violations.length > 0 && !options.keepViolations) continue;
    const key = `${equivalenceKey(course, section)}|${violations.join(",")}`;
    const group = byKey.get(key);
    if (group) group.sections.push(section);
    else byKey.set(key, { sections: [section], violations });
  }
  return [...byKey.values()].map(({ sections: members, violations }) => {
    const sections = withRepresentativeFirst(course, members, options.seats);
    // biome-ignore lint/style/noNonNullAssertion: a group is created with its first section
    const rep = sections[0]!;
    const items = weekOrdered(course, rep);
    const ratings: (number | null)[] = [];
    const gpas: (number | null)[] = [];
    for (const s of sections) {
      const q = options.quality.get(sectionKey(course.code, s.code));
      ratings.push(q?.rating ?? null);
      gpas.push(q?.gpa ?? null);
    }
    const mask = weekMaskOf(items);
    return {
      course,
      sections,
      items,
      dayIndexes: Uint8Array.from(items, (i) => dayIndex(i.day)),
      mask,
      sparse: toSparse(mask),
      openSeats:
        seatCounts(options.seats, sectionKey(course.code, rep.code))?.open ??
        null,
      rating: best(ratings),
      gpa: best(gpas),
      violations,
    };
  });
}

/**
 * How good a section's seats are for registering: the most open seats
 * first, then unknown counts (Testudo may still have room), then full.
 */
function seatRank(seats: SeatsMap | null, key: SectionKey): number {
  const counts = seatCounts(seats, key);
  if (counts === null) return 0;
  return counts.open > 0 ? counts.open : -1;
}

/**
 * The group's sections with the one Save as new plan adds first: the one
 * with the most open seats, so the seats a result shows are the seats of
 * the section it saves (QA S1: it showed the group's total and saved a full
 * one). Ties, and the rest, keep section-number order.
 */
function withRepresentativeFirst(
  course: Course,
  sections: readonly Section[],
  seats: SeatsMap | null,
): Section[] {
  let best = 0;
  let bestRank = Number.NEGATIVE_INFINITY;
  sections.forEach((s, i) => {
    const rank = seatRank(seats, sectionKey(course.code, s.code));
    if (rank > bestRank) {
      best = i;
      bestRank = rank;
    }
  });
  return [
    ...sections.slice(best, best + 1),
    ...sections.slice(0, best),
    ...sections.slice(best + 1),
  ];
}

/** Mean of the non-null values, for averaging instructors. */
export function meanOf(values: readonly (number | null)[]): number | null {
  return mean(values.filter((v): v is number => v !== null));
}

export type CourseCandidates = {
  readonly courseCode: CourseCode;
  readonly course: Course | null;
  readonly groups: readonly SectionGroup[];
};
