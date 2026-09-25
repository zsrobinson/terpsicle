import type {
  Block,
  BuildingCode,
  CourseCode,
  DateSpan,
  Day,
  LocalId,
  Minutes,
  Section,
  SectionKey,
} from "../schema";
import { sectionKey } from "../schema";

// A plan's week flattened into one item per (meeting or block, day): the unit
// that overlap checks, travel legs, fit and the calendar all work on.

/** Two date spans share a day. null is the whole term, so it meets everything. */
export function dateSpansIntersect(
  a: DateSpan | null,
  b: DateSpan | null,
): boolean {
  if (a === null || b === null) return true;
  return a.start <= b.end && b.start <= a.end;
}

export type MeetingSource = {
  readonly kind: "meeting";
  readonly sectionKey: SectionKey;
  readonly courseCode: CourseCode;
  readonly meetingIndex: number;
  readonly building: BuildingCode | null;
  readonly room: string | null;
  /** Takes part in travel: not online, and has a building. */
  readonly inPerson: boolean;
};

export type BlockSource = {
  readonly kind: "block";
  readonly blockId: LocalId;
  readonly label: string;
};

export type WeekItem = {
  readonly day: Day;
  readonly start: Minutes;
  readonly end: Minutes;
  /** The section's own dates; null for the whole term. */
  readonly dates: DateSpan | null;
  readonly source: MeetingSource | BlockSource;
};

export type MeetingItem = WeekItem & { readonly source: MeetingSource };

const itemsBySection = new WeakMap<Section, readonly MeetingItem[]>();

/**
 * One item per day of each timed meeting, in meeting order. Memoized per
 * section object (catalog objects are never mutated), because the search
 * filter asks for thousands of sections on every plan change.
 */
export function sectionWeekItems(
  courseCode: CourseCode,
  section: Section,
): readonly MeetingItem[] {
  // A section object belongs to exactly one course, so it alone is the key.
  const cached = itemsBySection.get(section);
  if (cached) return cached;
  const key = sectionKey(courseCode, section.code);
  const dates = section.dates ?? null;
  const items: MeetingItem[] = [];
  section.meetings.forEach((m, meetingIndex) => {
    if (!m.timed) return;
    const source: MeetingSource = {
      kind: "meeting",
      sectionKey: key,
      courseCode,
      meetingIndex,
      building: m.building,
      room: m.room,
      inPerson: !m.online && m.building !== null,
    };
    for (const day of m.days)
      items.push({ day, start: m.start, end: m.end, dates, source });
  });
  itemsBySection.set(section, items);
  return items;
}

export function blockWeekItems(block: Block): WeekItem[] {
  const source: BlockSource = {
    kind: "block",
    blockId: block.id,
    label: block.label,
  };
  return block.days.map((day) => ({
    day,
    start: block.start,
    end: block.end,
    dates: null,
    source,
  }));
}

/** Whether a section has at least one meeting with set days and times. */
export function hasSetTimes(section: Section): boolean {
  return section.meetings.some((m) => m.timed);
}

/** Half-open time overlap: a class ending at 10:00 doesn't overlap one starting at 10:00. */
export function timesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Same day, overlapping times, and date ranges that share a day. */
export function itemsOverlap(a: WeekItem, b: WeekItem): boolean {
  return (
    a.day === b.day &&
    timesOverlap(a, b) &&
    dateSpansIntersect(a.dates, b.dates)
  );
}
