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
  DateSpan,
  Day,
  Delivery,
  LocalId,
  MeetingKind,
  Minutes,
  Plan,
  Section,
  SectionCode,
  SectionKey,
} from "~/core/schema";
import { parseSectionKey, sectionKey } from "~/core/schema";
import { type SeatsMap, seatCounts, seatLevel } from "~/core/seats";
import {
  blockWeekItems,
  calendarDays,
  calendarHourRange,
  formatDays,
  formatTime,
  formatTimeRange,
  hasSetTimes,
  type Lane,
  type MeetingItem,
  packLanes,
  sectionWeekItems,
  type WeekItem,
} from "~/core/time";
import { shouldShowPill } from "~/core/travel/pill";

export interface Timed {
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
  /** The section's own dates (every summer section), null for the whole term. */
  dates: DateSpan | null;
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
  /**
   * What it overlaps ("ENGL101", "Lunch"), since the ghost is drawn over it
   * and hides its label. Null when it overlaps several things.
   */
  overlapsWith: string | null;
  /** Drawn solid: it's being previewed. */
  previewed: boolean;
  /** Which of its sections is previewed, so the label can name it. */
  previewCode: SectionCode | null;
  /**
   * Drawn over a crowded stretch's merged ghost, at the previewed section's
   * own time, so a preview is never lost inside a merge. Not a target.
   */
  overlay?: boolean;
  /** Each section's meetings, "MWF 10am–10:50am · Tu 2pm–2:50pm", for the popover. */
  when: Readonly<Record<SectionCode, string>>;
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
  /**
   * Why it has no time: Testudo lists no meetings (ask the department, as
   * course details says), it's online, or its times aren't set yet.
   */
  reason: "contact-department" | "online" | "times-tba";
  color: CourseColor;
}

export interface DayColumn {
  day: Day;
  /** In lanes with the ghosts while they show (`packDay`), for a desktop-width column. */
  entries: Lane<ClassEntry | BlockEntry>[];
  ghosts: Lane<GhostEntry>[];
  /** Both unpacked, for packing again in a narrower column. */
  entryItems: (ClassEntry | BlockEntry)[];
  ghostItems: GhostEntry[];
  /** Only between back-to-back classes (`shouldShowPill`), and never over ghosts. */
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
  /** The connection open in the sidebar: its pill shows even when it'd be hidden. */
  selectedConnection?: string | null;
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
  // drawn in full, except a meeting that is the placed one (same time and
  // room: the shared lecture), which the placed class already shows.
  const placedSection = placedCode
    ? course.sections.find((s) => s.code === placedCode)
    : undefined;
  const placedItems = placedSection
    ? sectionWeekItems(course.code, placedSection)
    : [];
  const placedTimes = new Set(placedItems.map(meetingTimeKey));
  const placedMeetings = new Set(placedItems.map(meetingPlaceKey));
  const previewCode = input.preview
    ? (parseSectionKey(input.preview)?.sectionCode ?? null)
    : null;
  const entries: GhostEntry[] = [];
  for (const group of drawn) {
    const rep = group.sections[0];
    if (!rep) continue;
    const key = sectionKey(course.code, rep.code);
    const times = meetingTimes(rep);
    const when = Object.fromEntries(group.sections.map((s) => [s.code, times]));
    const full =
      input.seats !== null &&
      group.sections.every(
        (s) =>
          seatLevel(
            seatCounts(input.seats, sectionKey(course.code, s.code)),
          ) === "full",
      );
    const fitNow = input.fit ? fitLabel(input.fit, course, rep) : null;
    const overlaps = fitNow?.kind === "overlaps";
    const overlapsWith =
      fitNow?.kind === "overlaps"
        ? fitNow.with.kind === "course"
          ? fitNow.with.courseCode
          : fitNow.with.label
        : null;
    for (const item of sectionWeekItems(course.code, rep)) {
      if (
        group === previewGroup
          ? placedMeetings.has(meetingPlaceKey(item))
          : placedTimes.has(meetingTimeKey(item))
      )
        continue;
      entries.push({
        kind: "ghost",
        key: `ghost:${key}:${item.source.meetingIndex}:${item.day}`,
        day: item.day,
        start: item.start,
        end: item.end,
        sectionKey: key,
        sectionCodes: group.sections.map((s) => s.code),
        label: ghostGroupLabel(group.sections.map((s) => s.code)),
        sameTimes: true,
        instructors: rep.instructors.join(", "),
        meetingKind: rep.meetings[item.source.meetingIndex]?.kind ?? "lecture",
        full,
        overlaps,
        overlapsWith,
        previewed: group === previewGroup,
        previewCode: group === previewGroup ? previewCode : null,
        when,
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

/** "MWF 10am–10:50am · Tu 2pm–2:50pm": a section's timed meetings, no rooms. */
function meetingTimes(section: Section): string {
  return section.meetings
    .flatMap((m) =>
      m.timed
        ? [`${formatDays(m.days)} ${formatTimeRange(m.start, m.end)}`]
        : [],
    )
    .join(" · ");
}

/** When, on which dates and where a meeting happens: the same meeting. */
function meetingPlaceKey(item: MeetingItem): string {
  return `${meetingTimeKey(item)}@${item.source.building ?? ""} ${item.source.room ?? ""}`;
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
  // At one time, the preview is exactly this box, so the box turns solid.
  // Merged across a stretch, the box isn't the preview's time: `packGhosts`
  // draws the preview over it instead.
  const exact = ghosts.every((g) => g.start === start && g.end === end);
  return {
    ...first,
    key: `merged:${first.day}:${start}:${ghosts.map((g) => g.key).join("|")}`,
    start,
    end,
    // Hovering previews a section inside, so the box stays put under the pointer.
    sectionKey: (previewed ?? first).sectionKey,
    sectionCodes: codes,
    label: ghostGroupLabel(codes),
    sameTimes: false,
    instructors: [...new Set(ghosts.map((g) => g.instructors))].join(", "),
    meetingKind: ghosts.every((g) => g.meetingKind === first.meetingKind)
      ? first.meetingKind
      : "lecture",
    full: ghosts.every((g) => g.full),
    overlaps: ghosts.every((g) => g.overlaps),
    overlapsWith: ghosts.every((g) => g.overlapsWith === first.overlapsWith)
      ? first.overlapsWith
      : null,
    previewed: exact && previewed !== undefined,
    previewCode: exact ? (previewed?.previewCode ?? null) : null,
    when: Object.assign({}, ...ghosts.map((g) => g.when)),
  };
}

/**
 * Ghosts at exactly the same time on a day, as one ghost. Side by side they
 * only repeat each other ("0111 ×2 | 0121 ×2 | 0131"); merged, the popover
 * lists each section with its other meetings.
 */
function mergeSameTime(ghosts: readonly GhostEntry[]): GhostEntry[] {
  const byTime = new Map<string, GhostEntry[]>();
  for (const g of ghosts) {
    const at = `${g.start}-${g.end}`;
    const list = byTime.get(at);
    if (list) list.push(g);
    else byTime.set(at, [g]);
  }
  return [...byTime.values()].map((list) =>
    list.length === 1 && list[0]
      ? list[0]
      : mergeGhosts(list, list[0]?.start ?? 0, list[0]?.end ?? 0),
  );
}

type DayEntry = ClassEntry | BlockEntry;

type Slot = Timed & {
  ghost: GhostEntry | null;
  entry: DayEntry | null;
  /** A class of the ghost course itself: its lane comes first. */
  own: boolean;
};

/**
 * The day's classes, blocks and ghosts in one set of lanes, so a dimmed
 * class sits beside the ghosts it overlaps instead of under them (SPEC §3.3:
 * other classes dim, they don't vanish). In each cluster the lanes are
 * reordered: the ghost course's own class first, then the plan's other
 * classes and blocks, then ghosts. Each is drawn in its lane, so every
 * label stays readable.
 */
function packSlots(
  ghosts: readonly GhostEntry[],
  entries: readonly DayEntry[],
  ownCourse: CourseCode | null,
): Lane<Slot>[] {
  const packed = packLanes<Slot>([
    ...entries.map((entry) => ({
      day: entry.day,
      start: entry.start,
      end: entry.end,
      ghost: null,
      entry,
      own: entry.kind === "class" && entry.courseCode === ownCourse,
    })),
    ...ghosts.map((ghost) => ({
      day: ghost.day,
      start: ghost.start,
      end: ghost.end,
      ghost,
      entry: null,
      own: false,
    })),
  ]);
  for (const cluster of clusters(packed)) {
    const lanes = cluster[0]?.lanes ?? 0;
    if (lanes < 2) continue;
    const rank = (lane: number) =>
      cluster.some((s) => s.lane === lane && s.own)
        ? 0
        : cluster.some((s) => s.lane === lane && s.entry)
          ? 1
          : 2;
    const order = Array.from({ length: lanes }, (_, i) => i).sort(
      (a, b) => rank(a) - rank(b) || a - b,
    );
    const to = new Map(order.map((lane, i) => [lane, i]));
    for (const slot of cluster) slot.lane = to.get(slot.lane) ?? slot.lane;
  }
  return packed;
}

/** Lanes in a cluster that hold a ghost. */
function ghostLanes(cluster: readonly Lane<Slot>[]): number {
  return new Set(cluster.flatMap((s) => (s.ghost ? [s.lane] : []))).size;
}

/**
 * One day in lanes: the plan's classes and blocks, and the ghost course's
 * sections. Ghosts at the same time always merge. Where more than
 * `maxLanes` ghosts would still sit side by side, the crowded stretch
 * merges into one ghost. The ghost course's own class keeps the first lane,
 * and the plan's other classes sit beside the ghosts, dimmed but readable.
 * A preview merged into a stretch comes back as an `overlay` entry at its
 * own time, in the merged ghost's lane, so it's always visible. With no
 * ghosts, the entries pack as they always have.
 */
export function packDay(
  entries: readonly DayEntry[],
  ghosts: readonly GhostEntry[],
  maxLanes: number = MAX_GHOST_LANES,
  ownCourse: CourseCode | null = null,
): { entries: Lane<DayEntry>[]; ghosts: Lane<GhostEntry>[] } {
  const real = ghosts.filter((g) => !g.overlay);
  if (real.length === 0) return { entries: packLanes(entries), ghosts: [] };
  const sameTime = mergeSameTime(real);
  const out: GhostEntry[] = [];
  const previews = new Map<string, GhostEntry>();
  for (const cluster of clusters(packSlots(sameTime, entries, ownCourse))) {
    const inCluster = cluster.flatMap((slot) =>
      slot.ghost ? [slot.ghost] : [],
    );
    if (ghostLanes(cluster) <= maxLanes || inCluster.length < 2) {
      out.push(...inCluster);
      continue;
    }
    const merged = mergeGhosts(
      inCluster,
      Math.min(...inCluster.map((g) => g.start)),
      Math.max(...inCluster.map((g) => g.end)),
    );
    const previewed = inCluster.find((g) => g.previewed);
    if (previewed) previews.set(merged.key, previewed);
    out.push(merged);
  }
  const packed = packSlots(out, entries, ownCourse);
  const placedGhosts = packed.flatMap((slot) =>
    slot.ghost ? [{ ...slot.ghost, lane: slot.lane, lanes: slot.lanes }] : [],
  );
  const overlays = placedGhosts.flatMap((g) => {
    const previewed = previews.get(g.key);
    return previewed
      ? [
          {
            ...previewed,
            key: `overlay:${previewed.key}`,
            overlay: true,
            lane: g.lane,
            lanes: g.lanes,
          },
        ]
      : [];
  });
  return {
    entries: packed.flatMap((slot) =>
      slot.entry ? [{ ...slot.entry, lane: slot.lane, lanes: slot.lanes }] : [],
    ),
    ghosts: [...placedGhosts, ...overlays],
  };
}

/** About one character of the ghosts' 10px mono, and a ghost's padding and border, in px. */
const GHOST_CHAR = 6.1;
const GHOST_PAD = 16;

interface GhostLabel {
  /** The part that must read: a code, or a range of codes. */
  text: string;
  /** "×6" or "+2", muted, given up first. */
  count: string | null;
  /** Room for the instructor's line. */
  instructor: boolean;
}

/**
 * What a ghost says at its width. The section codes win the space: first
 * the "· 6 sections" goes, then the instructor, then the range shrinks to
 * its first code (UX-REVIEW §4.2). Width null: not measured, so everything.
 */
/** Section numbers that follow on one another: 0101, 0102, 0103. */
function consecutive(codes: readonly SectionCode[]): boolean {
  return codes.every((code, i) => {
    if (i === 0) return true;
    const prev = Number(codes[i - 1]);
    return Number.isInteger(prev) && Number(code) === prev + 1;
  });
}

/**
 * The codes, shortest honest way: "0101–0105" for a run, "0102 · 0201 ·
 * 0302" for a few that aren't (a range would claim 0103–0301 too), and
 * first–last past three.
 */
export function codeSpan(codes: readonly SectionCode[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  if (codes.length <= 3 && !consecutive(codes)) return codes.join(" · ");
  return `${codes[0]}–${codes[codes.length - 1]}`;
}

/** "0101", "0101–0106 · 6 sections", "0102 · 0201 · 0302 · 3 sections". */
export function ghostGroupLabel(codes: readonly SectionCode[]): string {
  if (codes.length <= 1) return codes[0] ?? "";
  return `${codeSpan(codes)} · ${codes.length} sections`;
}

export function ghostLabel(
  entry: Pick<GhostEntry, "sectionCodes" | "label" | "previewCode">,
  width: number | null,
): GhostLabel {
  const codes = entry.sectionCodes;
  const first = codes[0] ?? "";
  const fits = (text: string) =>
    width === null || text.length * GHOST_CHAR + GHOST_PAD <= width;
  if (codes.length <= 1)
    return { text: first, count: null, instructor: fits(first) };
  // One of them is previewed: name it, not the group.
  if (entry.previewCode)
    return {
      text: entry.previewCode,
      count: `+${codes.length - 1}`,
      instructor: false,
    };
  if (fits(entry.label))
    return { text: entry.label, count: null, instructor: true };
  const range = codeSpan(codes);
  const times = `×${codes.length}`;
  if (fits(`${range} ${times}`))
    return { text: range, count: times, instructor: false };
  if (fits(range)) return { text: range, count: null, instructor: false };
  return { text: first, count: times, instructor: false };
}

/** About one character of the calendar's 10px text, in px (digits and "am" run widest). */
const CLOCK_CHAR = 6;

/**
 * A class or block's time line for its width: the range when it fits, else
 * its start ("9:30am"), else nothing. "9:…" says nothing, and the block's
 * height and the hour lines already show the end.
 */
export function clockLabel(
  start: number,
  end: number,
  width: number | null,
  pad: number,
): string | null {
  const fits = (text: string) =>
    width === null || text.length * CLOCK_CHAR + pad <= width;
  const range = formatTimeRange(start, end);
  if (fits(range)) return range;
  const first = formatTime(start);
  return fits(first) ? first : null;
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
        reason:
          section.meetings.length === 0
            ? "contact-department"
            : section.delivery === "online-async" ||
                section.delivery === "online-sync"
              ? "online"
              : "times-tba",
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
        dates: item.dates,
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
  const ghostsOn = (day: Day) => ghosts.filter((g) => g.day === day);
  // Pills sit on ghost labels, and while comparing sections the travel of
  // the current ones is beside the point (UX-REVIEW §4.3).
  const pills = summary
    ? []
    : input.connections.filter(
        (c) => shouldShowPill(c) || c.id === input.selectedConnection,
      );
  const hours = calendarHourRange(everything);
  const days = calendarDays(everything);

  const columns: DayColumn[] = days.map((day) => {
    const ghostItems = ghostsOn(day);
    const entryItems = [
      ...classes.filter((c) => c.day === day),
      ...blocks.filter((b) => b.day === day),
    ];
    return {
      day,
      ...packDay(
        entryItems,
        ghostItems,
        MAX_GHOST_LANES,
        summary?.courseCode ?? null,
      ),
      entryItems,
      ghostItems,
      pills: pills
        .filter((c) => c.day === day)
        .map((connection) => ({
          key: connection.id,
          day,
          at: (connection.from.time + connection.to.time) / 2,
          connection,
        })),
    };
  });

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

/**
 * Pills closer than this, in px, would cover each other: a pill's target is
 * 24px tall (WCAG 2.5.8), around the 19px pill drawn.
 */
export const PILL_CLEARANCE = 24;
/** About the widest pill ("18 min" with its icon), in px. */
export const PILL_WIDTH = 56;

/**
 * The pills to draw while a course's sections show as ghosts: only those
 * touching that course. The rest join two dimmed classes, and would sit on
 * top of the sections being compared, covering part of each one's target.
 */
export function pillsWhileComparing(
  pills: readonly Pill[],
  ghostCourse: CourseCode | null,
): readonly Pill[] {
  if (!ghostCourse) return pills;
  const touches = (key: string) => key.startsWith(`${ghostCourse}-`);
  return pills.filter(
    (p) =>
      touches(p.connection.from.sectionKey) ||
      touches(p.connection.to.sectionKey),
  );
}

/**
 * Where each of a day's pills goes, from their natural tops in px: `x`
 * across the column (0.5 centered) and the `top` to draw at. A class that
 * leads into two overlapping classes (or two into one) gives two pills at
 * the same spot, and the one drawn last would hide the other, even when
 * that one says "Not enough time". Pills that close sit side by side when
 * the column fits them, and stack otherwise (a phone's narrow days).
 */
export function spreadPills(
  tops: readonly number[],
  colWidth: number,
): { x: number; top: number }[] {
  const order = tops
    .map((top, i) => ({ top, i }))
    .sort((a, b) => a.top - b.top || a.i - b.i);
  const out = tops.map((top) => ({ x: 0.5, top }));
  let cluster: typeof order = [];
  const flush = () => {
    const n = cluster.length;
    const sideBySide = colWidth <= 0 || colWidth >= n * PILL_WIDTH;
    const first = cluster[0]?.top ?? 0;
    cluster.forEach(({ i, top }, k) => {
      out[i] = sideBySide
        ? { x: (k + 0.5) / n, top }
        : { x: 0.5, top: first + (k - (n - 1) / 2) * PILL_CLEARANCE };
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

/** A vertical span on screen, in px. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * How far to scroll the calendar so a ghost shows: 0 when any ghost is
 * already in the visible band (only if needed), otherwise enough to bring
 * the first one just under its top. A phone's drawer at half covers the
 * lower part of the calendar, so a course at 12:30 can open with every
 * ghost out of sight.
 */
export function ghostScrollDelta(
  ghosts: readonly Span[],
  view: Span,
  margin = 8,
): number {
  if (ghosts.length === 0 || view.bottom <= view.top) return 0;
  const inView = ghosts.some(
    (g) => g.bottom > view.top + margin && g.top < view.bottom - margin,
  );
  if (inView) return 0;
  const first = Math.min(...ghosts.map((g) => g.top));
  return first - view.top - margin;
}
