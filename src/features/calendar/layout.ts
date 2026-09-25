// The calendar's model: what goes in which day column, at what time, and in
// which side-by-side lane. Pure, so it's memoized and benchmarked on its own.
// Domain answers come from core (week items, hour range, days, ghost groups
// and cap, fit, seats, connections); what's here is presentation layout.
// `packLanes` is a candidate to move into ~/core/time.
import {
  type CatalogIndex,
  capGhosts,
  groupSectionsByTime,
  placedSections,
  type TimeGroup,
} from "~/core/catalog";
import { defaultCourseColor } from "~/core/color";
import { type FitContext, fitLabel } from "~/core/fit";
import type {
  Block,
  BuildingCode,
  Connection,
  Course,
  CourseCode,
  CourseColor,
  Day,
  Delivery,
  LocalId,
  MeetingKind,
  Minutes,
  Plan,
  SectionCode,
  SectionKey,
} from "~/core/schema";
import { sectionKey } from "~/core/schema";
import { type SeatsMap, seatCounts, seatLevel } from "~/core/seats";
import {
  blockWeekItems,
  calendarDays,
  calendarHourRange,
  hasSetTimes,
  sectionWeekItems,
} from "~/core/time";

interface Timed {
  day: Day;
  start: Minutes;
  end: Minutes;
}

/** A class meeting on one day. */
export interface ClassEntry extends Timed {
  kind: "class";
  /** Unique per section, meeting and day. */
  key: string;
  sectionKey: SectionKey;
  courseCode: CourseCode;
  sectionCode: SectionCode;
  meetingKind: MeetingKind;
  building: BuildingCode | null;
  room: string | null;
  online: boolean;
  color: CourseColor;
}

/** A block of busy time on one day. Blocks have no place. */
export interface BlockEntry extends Timed {
  kind: "block";
  key: string;
  blockId: LocalId;
  label: string;
}

/** One ghost on one day: a group of time-identical sections of the ghost course. */
export interface GhostEntry extends Timed {
  kind: "ghost";
  key: string;
  /** The group's first section; switching picks it unless one is chosen. */
  sectionKey: SectionKey;
  sectionCodes: readonly SectionCode[];
  /** "0101" or "0101–0106 · 6 sections". */
  label: string;
  /** The first section's instructors, "" for TBA. */
  instructors: string;
  meetingKind: MeetingKind;
  /** Every section in the group is full. */
  full: boolean;
  /** It overlaps a class or block in the plan. */
  overlaps: boolean;
  /** Drawn solid: it's being previewed. */
  previewed: boolean;
  color: CourseColor;
}

export type Lane<T> = T & {
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** Columns in its overlap cluster. */
  lanes: number;
};

export interface Pill {
  key: string;
  day: Day;
  /** Where to center it: halfway through the gap. */
  at: Minutes;
  connection: Connection;
}

export interface UntimedSection {
  sectionKey: SectionKey;
  courseCode: CourseCode;
  sectionCode: SectionCode;
  delivery: Delivery;
  color: CourseColor;
}

export interface DayColumn {
  day: Day;
  entries: Lane<ClassEntry | BlockEntry>[];
  ghosts: Lane<GhostEntry>[];
  pills: Pill[];
}

export interface GhostSummary {
  courseCode: CourseCode;
  color: CourseColor;
  /** Groups drawn, in section order. */
  groups: readonly TimeGroup[];
  /** Groups beyond the cap: listed in the sidebar, not drawn. */
  overflow: number;
  /** The course's section in the plan, if it's placed. */
  placedCode: SectionCode | null;
}

export interface CalendarModel {
  days: Day[];
  startMinute: Minutes;
  endMinute: Minutes;
  columns: DayColumn[];
  untimed: UntimedSection[];
  ghost: GhostSummary | null;
}

export interface CalendarInput {
  plan: Plan;
  index: CatalogIndex;
  blocks: readonly Block[];
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  connections: readonly Connection[];
  /** The course whose other sections show as ghosts. */
  ghostCourse: Course | null;
  /** For ghost "Overlaps"; null while it can't be built yet. */
  fit: FitContext | null;
  seats: SeatsMap | null;
  /** A section of the ghost course to draw solid. */
  preview: SectionKey | null;
}

/**
 * Side-by-side lanes for overlapping items (SPEC §3.3): items that overlap,
 * directly or through a chain, form a cluster, and each takes the first lane
 * free at its start. Every item in a cluster shares the cluster's lane count.
 */
export function packLanes<T extends { start: number; end: number }>(
  items: readonly T[],
): Lane<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Lane<T>[] = [];
  let cluster: Lane<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else laneEnds[lane] = item.end;
    const placed = { ...item, lane, lanes: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}

function colorOf(
  code: CourseCode,
  colors: CalendarInput["colors"],
): CourseColor {
  return colors[code] ?? defaultCourseColor(code, []);
}

function ghostEntries(input: CalendarInput): {
  entries: GhostEntry[];
  summary: GhostSummary | null;
} {
  const course = input.ghostCourse;
  if (!course) return { entries: [], summary: null };
  const placed = input.plan.courses.find((c) => c.courseCode === course.code);
  const placedCode = placed?.sectionCode ?? null;
  const groups = groupSectionsByTime(course, placedCode ? [placedCode] : []);
  const { shown, overflow } = capGhosts(groups);
  // A previewed section past the cap still gets drawn, so ↑/↓ and hovering
  // a section row in the sidebar always show something.
  const previewGroup = input.preview
    ? groups.find((g) =>
        g.sections.some(
          (s) => sectionKey(course.code, s.code) === input.preview,
        ),
      )
    : undefined;
  const drawn =
    previewGroup && !shown.includes(previewGroup)
      ? [...shown, previewGroup]
      : shown;
  const color = colorOf(course.code, input.colors);
  const entries: GhostEntry[] = [];
  for (const group of drawn) {
    const rep = group.sections[0];
    if (!rep) continue;
    const key = sectionKey(course.code, rep.code);
    const full =
      input.seats !== null &&
      group.sections.every(
        (s) =>
          seatLevel(
            seatCounts(input.seats, sectionKey(course.code, s.code)),
          ) === "full",
      );
    const overlaps =
      input.fit !== null &&
      fitLabel(input.fit, course, rep).kind === "overlaps";
    for (const item of sectionWeekItems(course.code, rep)) {
      entries.push({
        kind: "ghost",
        key: `ghost:${key}:${item.source.meetingIndex}:${item.day}`,
        day: item.day,
        start: item.start,
        end: item.end,
        sectionKey: key,
        sectionCodes: group.sections.map((s) => s.code),
        label: group.label,
        instructors: rep.instructors.join(", "),
        meetingKind: rep.meetings[item.source.meetingIndex]?.kind ?? "lecture",
        full,
        overlaps,
        previewed: group === previewGroup,
        color,
      });
    }
  }
  return {
    entries,
    summary: {
      courseCode: course.code,
      color,
      groups: shown,
      overflow: overflow.length,
      placedCode,
    },
  };
}

/** Everything the calendar draws for one plan state. */
export function buildCalendarModel(input: CalendarInput): CalendarModel {
  const classes: ClassEntry[] = [];
  const untimed: UntimedSection[] = [];
  for (const ref of placedSections(input.plan, input.index)) {
    const { course, section, key } = ref;
    const color = colorOf(course.code, input.colors);
    if (!hasSetTimes(section)) {
      untimed.push({
        sectionKey: key,
        courseCode: course.code,
        sectionCode: section.code,
        delivery: section.delivery,
        color,
      });
      continue;
    }
    for (const item of sectionWeekItems(course.code, section)) {
      const meeting = section.meetings[item.source.meetingIndex];
      classes.push({
        kind: "class",
        key: `${key}:${item.source.meetingIndex}:${item.day}`,
        day: item.day,
        start: item.start,
        end: item.end,
        sectionKey: key,
        courseCode: course.code,
        sectionCode: section.code,
        meetingKind: meeting?.kind ?? "lecture",
        building: item.source.building,
        room: item.source.room,
        online: meeting?.online ?? false,
        color,
      });
    }
  }
  const blocks: BlockEntry[] = input.blocks.flatMap((block) =>
    blockWeekItems(block).map((item) => ({
      kind: "block" as const,
      key: `${block.id}:${item.day}`,
      day: item.day,
      start: item.start,
      end: item.end,
      blockId: block.id,
      label: block.label,
    })),
  );
  const { entries: ghosts, summary } = ghostEntries(input);

  const everything: Timed[] = [...classes, ...blocks, ...ghosts];
  const hours = calendarHourRange(everything);
  const days = calendarDays(everything);

  const columns: DayColumn[] = days.map((day) => ({
    day,
    entries: packLanes<ClassEntry | BlockEntry>([
      ...classes.filter((c) => c.day === day),
      ...blocks.filter((b) => b.day === day),
    ]),
    ghosts: packLanes(ghosts.filter((g) => g.day === day)),
    pills: input.connections
      .filter((c) => c.day === day)
      .map((connection) => ({
        key: connection.id,
        day,
        at: (connection.from.time + connection.to.time) / 2,
        connection,
      })),
  }));

  return {
    days,
    startMinute: hours.start,
    endMinute: hours.end,
    columns,
    untimed,
    ghost: summary,
  };
}

/**
 * The previewable sections, in section order, for ↑/↓: the placed section
 * first (so ↑/↓ starts from where you are), then each drawn ghost group's
 * first section.
 */
export function previewOrder(
  ghost: GhostSummary | null,
): readonly SectionKey[] {
  if (!ghost) return [];
  const keys = ghost.groups.flatMap((g) =>
    g.sections[0] ? [sectionKey(ghost.courseCode, g.sections[0].code)] : [],
  );
  const placed = ghost.placedCode
    ? sectionKey(ghost.courseCode, ghost.placedCode)
    : null;
  if (!placed) return keys;
  const all = [...keys, placed];
  return all.sort();
}

/** The next preview for ↑ (-1) or ↓ (+1), wrapping around. */
export function stepPreview(
  order: readonly SectionKey[],
  current: SectionKey | null,
  step: 1 | -1,
): SectionKey | null {
  if (order.length === 0) return null;
  const i = current ? order.indexOf(current) : -1;
  if (i === -1) return order[step === 1 ? 0 : order.length - 1] ?? null;
  return order[(i + step + order.length) % order.length] ?? null;
}
