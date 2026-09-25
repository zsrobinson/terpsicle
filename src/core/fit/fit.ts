import {
  type CatalogIndex,
  placedSections,
  type SectionRef,
} from "../catalog/catalog-index";
import {
  type Block,
  type Course,
  type CourseCode,
  type Day,
  type FitLabel,
  type Plan,
  type Section,
  type SectionKey,
  sectionKey,
  type TravelSettings,
} from "../schema";
import { dayIndex } from "../time/format";
import {
  masksIntersect,
  unionMasks,
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
import type { CampusMap } from "../travel/campus";
import {
  buildConnection,
  isConsecutive,
  isStop,
  type Stop,
} from "../travel/connections";

// "Does this section fit my plan?" (SPEC §3.4, §3.5). The search filter asks
// this for every section of thousands of courses, so the plan side is
// precomputed once into busy bitmasks and per-day stops, and each section's
// own mask is memoized. Exact checks (dates, odd minutes, travel) run only
// when the masks can't rule a clash out.

export type FitInput = {
  readonly plan: Plan;
  readonly index: CatalogIndex;
  readonly blocks: readonly Block[];
  readonly travel: TravelSettings;
  /** Until the routes file loads, travel never rules a section out. */
  readonly campus: CampusMap;
};

type Busy = {
  readonly mask: WeekMask;
  readonly itemsByDay: ReadonlyMap<Day, readonly WeekItem[]>;
  readonly stopsByDay: ReadonlyMap<Day, readonly Stop[]>;
};

export type FitContext = {
  readonly inPlan: ReadonlySet<SectionKey>;
  readonly placed: readonly SectionRef[];
  readonly blocks: readonly Block[];
  readonly travel: TravelSettings;
  readonly campus: CampusMap;
  /** Busy time of everything except one course (the one being fitted); "" = everything. */
  readonly busyExcept: (courseCode: CourseCode) => Busy;
};

const maskBySection = new WeakMap<Section, WeekMask>();

/** A section's busy mask, memoized per section object. Shared with the generator. */
export function sectionMask(
  courseCode: CourseCode,
  section: Section,
): WeekMask {
  let mask = maskBySection.get(section);
  if (!mask) {
    mask = weekMaskOf(sectionWeekItems(courseCode, section));
    maskBySection.set(section, mask);
  }
  return mask;
}

function groupByDay<T extends { day: Day }>(items: Iterable<T>): Map<Day, T[]> {
  const byDay = new Map<Day, T[]>();
  for (const item of items) {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  }
  return byDay;
}

export function buildFitContext(input: FitInput): FitContext {
  const placed = placedSections(input.plan, input.index);
  const inPlan = new Set<SectionKey>();
  for (const c of input.plan.courses)
    if (c.sectionCode !== null)
      inPlan.add(sectionKey(c.courseCode, c.sectionCode));
  const blockItems = input.blocks.flatMap(blockWeekItems);
  const blockMask = weekMaskOf(blockItems);
  const planCourses = new Set(placed.map((r) => r.course.code));
  const cache = new Map<string, Busy>();

  const busyExcept = (courseCode: CourseCode): Busy => {
    // Every course outside the plan sees the same busy time; share one entry.
    const key = planCourses.has(courseCode) ? courseCode : "";
    const hit = cache.get(key);
    if (hit) return hit;
    const others = placed.filter((r) => r.course.code !== key);
    const meetingItems: MeetingItem[] = others.flatMap((r) => [
      ...sectionWeekItems(r.course.code, r.section),
    ]);
    const busy: Busy = {
      mask: unionMasks([
        blockMask,
        ...others.map((r) => sectionMask(r.course.code, r.section)),
      ]),
      itemsByDay: groupByDay<WeekItem>([...meetingItems, ...blockItems]),
      stopsByDay: groupByDay(
        meetingItems.filter((i) => isStop(i, input.campus)),
      ),
    };
    cache.set(key, busy);
    return busy;
  };

  return {
    inPlan,
    placed,
    blocks: input.blocks,
    travel: input.travel,
    campus: input.campus,
    busyExcept,
  };
}

function byWeekTime(a: WeekItem, b: WeekItem): number {
  return dayIndex(a.day) - dayIndex(b.day) || a.start - b.start;
}

function firstOverlap(
  items: readonly MeetingItem[],
  busy: Busy,
): WeekItem | null {
  for (const item of items) {
    for (const other of busy.itemsByDay.get(item.day) ?? []) {
      if (itemsOverlap(item, other)) return other;
    }
  }
  return null;
}

function firstShortConnection(
  items: readonly MeetingItem[],
  busy: Busy,
  ctx: FitContext,
): FitLabel | null {
  for (const x of items) {
    if (!isStop(x, ctx.campus)) continue;
    const planStops = busy.stopsByDay.get(x.day) ?? [];
    if (planStops.length === 0) continue;
    const dayStops = [
      ...planStops,
      ...items.filter((i) => i.day === x.day && isStop(i, ctx.campus)),
    ];
    for (const c of planStops) {
      if (!isConsecutive(c, x, dayStops)) continue;
      const conn = buildConnection(c, x, ctx.travel, ctx.campus);
      if (conn?.verdict === "insufficient")
        return {
          kind: "not-enough-time",
          direction: "after",
          courseCode: c.source.courseCode,
        };
    }
    for (const e of planStops) {
      if (!isConsecutive(x, e, dayStops)) continue;
      const conn = buildConnection(x, e, ctx.travel, ctx.campus);
      if (conn?.verdict === "insufficient")
        return {
          kind: "not-enough-time",
          direction: "before",
          courseCode: e.source.courseCode,
        };
    }
  }
  return null;
}

/**
 * How a section fits against everything else in the plan, ignoring whether
 * it's the one already placed: fits, overlaps, not-enough-time or no-set-times.
 */
export function evaluateFit(
  ctx: FitContext,
  course: Course,
  section: Section,
): FitLabel {
  const items = sectionWeekItems(course.code, section);
  if (items.length === 0) return { kind: "no-set-times" };
  const busy = ctx.busyExcept(course.code);
  const ordered = [...items].sort(byWeekTime);
  if (masksIntersect(sectionMask(course.code, section), busy.mask)) {
    const other = firstOverlap(ordered, busy);
    if (other) {
      const s = other.source;
      return {
        kind: "overlaps",
        with:
          s.kind === "block"
            ? { kind: "block", blockId: s.blockId, label: s.label }
            : { kind: "course", courseCode: s.courseCode },
      };
    }
  }
  if (ctx.campus.routes) {
    const short = firstShortConnection(ordered, busy, ctx);
    if (short) return short;
  }
  return { kind: "fits" };
}

/**
 * The fit label in words (SPEC §3.4): Fits · Overlaps ENGL393 · Not enough
 * time after CMSC330 · In your plan · No set times.
 */
export function fitLabel(
  ctx: FitContext,
  course: Course,
  section: Section,
): FitLabel {
  if (ctx.inPlan.has(sectionKey(course.code, section.code)))
    return { kind: "in-plan" };
  return evaluateFit(ctx, course, section);
}

/** Fits the rest of the plan (a section with no set times always does). */
export function sectionFits(
  ctx: FitContext,
  course: Course,
  section: Section,
): boolean {
  const label = evaluateFit(ctx, course, section);
  return label.kind === "fits" || label.kind === "no-set-times";
}

/** "Sections · 2 fit". The placed section counts when it fits the rest. */
export function countFittingSections(ctx: FitContext, course: Course): number {
  let n = 0;
  for (const s of course.sections) if (sectionFits(ctx, course, s)) n++;
  return n;
}

/** The search filter "Fits my plan": any section fits. */
export function courseFitsPlan(ctx: FitContext, course: Course): boolean {
  return course.sections.some((s) => sectionFits(ctx, course, s));
}
