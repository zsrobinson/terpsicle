// The calendar's model: what goes in which day column, at what time, and in
// which side-by-side lane. Pure, so it's memoized and benchmarked on its own.
// Domain answers come from core (week items, hour range, days, ghost groups
// and cap, fit, seats, connections); what's here is presentation layout.
import {
  type CatalogIndex,
  capGhosts,
  groupSectionsByTime,
  placedSections,
  type TimeGroup,
  timeGroupLabel,
} from "~/core/catalog";
import { defaultCourseColor, resolveCourseColors } from "~/core/color";
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
  type Lane,
  packLanes,
  sectionWeekItems,
  type WeekItem,
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
  /**
   * Every section in it meets at the same times all week. False for ghosts
   * merged only because the day got too crowded to read.
   */
  sameTimes: boolean;
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
  /** Every section the course has, placed or not. */
  sectionCount: number;
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

function colorOf(
  code: CourseCode,
  colors: CalendarInput["colors"],
): CourseColor {
  return colors[code] ?? defaultCourseColor(code, []);
}

/**
 * Every course on screen gets a color, distinct within the plan even when
 * none is stored (a shared link, a generated plan): the plan's courses in
 * order, then the ghost course.
 */
function withResolvedColors(input: CalendarInput): CalendarInput {
  const codes = input.plan.courses.map((c) => c.courseCode);
  if (input.ghostCourse) codes.push(input.ghostCourse.code);
  return {
    ...input,
    colors: { ...input.colors, ...resolveCourseColors(codes, input.colors) },
  };
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
  // Sibling sections often share the placed section's lecture (MATH140's
  // 0211–0222 all meet MWF 10am). A ghost of that shared meeting would sit on
  // top of the person's own class and hide it, and says nothing new, so it's
  // left out; each ghost still shows where it differs. A previewed section is
  // always drawn in full.
  const placedSection = placedCode
    ? course.sections.find((s) => s.code === placedCode)
    : undefined;
  const placedTimes = new Set(
    placedSection
      ? sectionWeekItems(course.code, placedSection).map(meetingTimeKey)
      : [],
  );
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
      if (group !== previewGroup && placedTimes.has(meetingTimeKey(item)))
        continue;
      entries.push({
        kind: "ghost",
        key: `ghost:${key}:${item.source.meetingIndex}:${item.day}`,
        day: item.day,
        start: item.start,
        end: item.end,
        sectionKey: key,
        sectionCodes: group.sections.map((s) => s.code),
        label: group.label,
        sameTimes: true,
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
      sectionCount: course.sections.length,
    },
  };
}

/** When and on which dates a meeting happens, ignoring where. */
function meetingTimeKey(item: WeekItem): string {
  const dates = item.dates ? `${item.dates.start}/${item.dates.end}` : "";
  return `${item.day}:${item.start}-${item.end}:${dates}`;
}

/**
 * Past this many side-by-side ghosts, labels shrink to "03…" and stop
 * reading, so a crowded stretch of a day merges.
 */
export const MAX_GHOST_LANES = 3;

/** The narrowest a ghost can be and still show a section code ("0111"). */
export const MIN_GHOST_WIDTH = 36;

/**
 * How many ghosts fit side by side in a day column this wide: three on
 * desktop, fewer on a phone, where three read as "01…". Zero width means
 * not measured yet (or a test DOM): keep the default.
 */
export function ghostLanesFor(colWidth: number): number {
  if (colWidth <= 0) return MAX_GHOST_LANES;
  return Math.max(
    1,
    Math.min(MAX_GHOST_LANES, Math.floor(colWidth / MIN_GHOST_WIDTH)),
  );
}

/** Several ghosts drawn as one, picked from a popover like a time-identical group. */
function mergeGhosts(
  ghosts: readonly GhostEntry[],
  start: Minutes,
  end: Minutes,
): GhostEntry {
  // Callers pass at least two ghosts.
  const first = ghosts[0] as GhostEntry;
  const codes = [...new Set(ghosts.flatMap((g) => g.sectionCodes))].sort();
  const previewed = ghosts.find((g) => g.previewed);
  return {
    ...first,
    key: `merged:${first.day}:${start}:${ghosts.map((g) => g.key).join("|")}`,
    start,
    end,
    // Hovering previews a section inside, so the box stays put under the pointer.
    sectionKey: (previewed ?? first).sectionKey,
    sectionCodes: codes,
    label: timeGroupLabel(codes),
    sameTimes: false,
    instructors: [...new Set(ghosts.map((g) => g.instructors))].join(", "),
    meetingKind: ghosts.every((g) => g.meetingKind === first.meetingKind)
      ? first.meetingKind
      : "lecture",
    full: ghosts.every((g) => g.full),
    overlaps: ghosts.every((g) => g.overlaps),
    previewed: previewed !== undefined,
  };
}

/**
 * One day's ghosts in lanes, merging where more than `maxLanes` would sit
 * side by side: first the ghosts that meet at the same time that day (their
 * other meetings differ), then, if that's not enough, the whole crowded
 * stretch into one ghost.
 */
export function packGhosts(
  ghosts: readonly GhostEntry[],
  maxLanes: number = MAX_GHOST_LANES,
): Lane<GhostEntry>[] {
  const packed = packLanes(ghosts);
  if (packed.every((g) => g.lanes <= maxLanes)) return packed;

  const out: GhostEntry[] = [];
  for (const cluster of clusters(packed)) {
    if ((cluster[0]?.lanes ?? 0) <= maxLanes) {
      out.push(...cluster);
      continue;
    }
    const byTime = new Map<string, GhostEntry[]>();
    for (const g of cluster) {
      const at = `${g.start}-${g.end}`;
      byTime.set(at, [...(byTime.get(at) ?? []), g]);
    }
    const sameTime = [...byTime.values()].map((list) =>
      list.length === 1 && list[0]
        ? list[0]
        : mergeGhosts(list, list[0]?.start ?? 0, list[0]?.end ?? 0),
    );
    const repacked = packLanes(sameTime);
    if (repacked.every((g) => g.lanes <= maxLanes)) out.push(...sameTime);
    else
      out.push(
        mergeGhosts(
          cluster,
          Math.min(...cluster.map((g) => g.start)),
          Math.max(...cluster.map((g) => g.end)),
        ),
      );
  }
  return packLanes(out);
}

/** Packed items split back into their overlap clusters. */
function clusters<T>(packed: readonly Lane<T & Timed>[]): Lane<T & Timed>[][] {
  const sorted = [...packed].sort((a, b) => a.start - b.start);
  const groups: Lane<T & Timed>[][] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const current = groups.at(-1);
    if (current && item.start < end) {
      current.push(item);
      end = Math.max(end, item.end);
    } else {
      groups.push([item]);
      end = item.end;
    }
  }
  return groups;
}

/** Everything the calendar draws for one plan state. */
export function buildCalendarModel(given: CalendarInput): CalendarModel {
  const input = withResolvedColors(given);
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
    ghosts: packGhosts(ghosts.filter((g) => g.day === day)),
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

/** Pills closer than this, in px, would cover each other. */
export const PILL_CLEARANCE = 20;

/**
 * Where each of a day's pills sits across its column, as a fraction (0.5 is
 * centered), from their tops in px. A class that leads into two overlapping
 * classes (or two into one) gives two pills at the same spot, and the one
 * drawn last would hide the other, even when that one says "Not enough
 * time"; pills that close share the width side by side instead.
 */
export function pillColumns(tops: readonly number[]): number[] {
  const order = tops
    .map((top, i) => ({ top, i }))
    .sort((a, b) => a.top - b.top || a.i - b.i);
  const out = tops.map(() => 0.5);
  let cluster: typeof order = [];
  const flush = () => {
    cluster.forEach(({ i }, k) => {
      out[i] = (k + 0.5) / cluster.length;
    });
    cluster = [];
  };
  for (const item of order) {
    const last = cluster.at(-1);
    if (last && item.top - last.top >= PILL_CLEARANCE) flush();
    cluster.push(item);
  }
  flush();
  return out;
}
