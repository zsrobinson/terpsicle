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
  type SparseMask,
  sparseIntersects,
  toSparse,
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
import { longestRoute } from "../travel/routes-binary";
import { travelMode, walkMinutes } from "../travel/walk";

// "Does this section fit my plan?" (SPEC §3.4, §3.5). The search filter asks
// this for every section of thousands of courses, so:
// - the plan side is precomputed once per context into busy bitmasks and
//   per-day stops, and each section's own mask is memoized;
// - exact checks (dates, odd minutes) run only when the masks can't rule a
//   clash out;
// - travel is checked only against plan classes closer in time than the
//   longest walk on campus could take;
// - each section's answer is memoized in the context, so later keystrokes
//   re-filter for free until the plan changes.

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

/** Build one per plan state with `buildFitContext`; don't reuse it after the plan changes. */
export type FitContext = {
  readonly inPlan: ReadonlySet<SectionKey>;
  readonly placed: readonly SectionRef[];
  readonly blocks: readonly Block[];
  readonly travel: TravelSettings;
  readonly campus: CampusMap;
  /** Longest possible walk in minutes; null without routes (travel never rules anything out). */
  readonly maxWalk: number | null;
  /** Busy time of everything except one course (the one being fitted). */
  readonly busyExcept: (courseCode: CourseCode) => Busy;
  /** Internal: answers already computed for this plan state. */
  readonly memo: {
    readonly sectionFits: Map<Section, boolean>;
    readonly courseFits: Map<Course, boolean>;
  };
};

/** Everything fit needs about one section, computed once (see `courseShapes`). */
type SectionShape = {
  /** Timed meetings per day, in week order (day, then start). */
  readonly items: readonly MeetingItem[];
  readonly mask: WeekMask;
  readonly sparse: SparseMask;
};

const shapesByCourse = new WeakMap<Course, readonly SectionShape[]>();

function shapeFor(courseCode: CourseCode, section: Section): SectionShape {
  const items = [...sectionWeekItems(courseCode, section)].sort(
    (a, b) => dayIndex(a.day) - dayIndex(b.day) || a.start - b.start,
  );
  const mask = weekMaskOf(items);
  return { items, mask, sparse: toSparse(mask) };
}

/**
 * Shapes for every section of a course, aligned with `course.sections`.
 * Cached per course object (catalog objects are never mutated): one lookup
 * per course keeps the search filter's per-section cost to a few ANDs.
 */
function courseShapes(course: Course): readonly SectionShape[] {
  let shapes = shapesByCourse.get(course);
  if (!shapes) {
    shapes = course.sections.map((s) => shapeFor(course.code, s));
    shapesByCourse.set(course, shapes);
  }
  return shapes;
}

/**
 * Computes every course's section masks ahead of time (about 0.2 s for a
 * full term). Call it in the worker right after a catalog loads, so the first
 * "Fits my plan" keystroke doesn't pay for it.
 */
export function prepareFit(courses: Iterable<Course>): void {
  for (const course of courses) courseShapes(course);
}

function shapeOf(course: Course, section: Section): SectionShape {
  const i = course.sections.indexOf(section);
  return courseShapes(course)[i] ?? shapeFor(course.code, section);
}

/** A section's busy mask, memoized. Shared with the generator. */
export function sectionMask(course: Course, section: Section): WeekMask {
  return shapeOf(course, section).mask;
}

/** `sectionMask` as a sparse mask, memoized. */
export function sectionSparseMask(
  course: Course,
  section: Section,
): SparseMask {
  return shapeOf(course, section).sparse;
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
  const { campus, travel } = input;
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
        ...others.map((r) => sectionMask(r.course, r.section)),
      ]),
      itemsByDay: groupByDay<WeekItem>([...meetingItems, ...blockItems]),
      stopsByDay: groupByDay(meetingItems.filter((i) => isStop(i, campus))),
    };
    cache.set(key, busy);
    return busy;
  };

  return {
    inPlan,
    placed,
    blocks: input.blocks,
    travel,
    campus,
    maxWalk: campus.routes
      ? walkMinutes(longestRoute(campus.routes, travelMode(travel)), travel)
      : null,
    busyExcept,
    memo: { sectionFits: new Map(), courseFits: new Map() },
  };
}

// Shared answers, so the search filter allocates nothing in the common case.
const FITS: FitLabel = Object.freeze({ kind: "fits" });
const NO_SET_TIMES: FitLabel = Object.freeze({ kind: "no-set-times" });

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

function isShort(from: Stop, to: Stop, ctx: FitContext): boolean {
  return (
    buildConnection(from, to, ctx.travel, ctx.campus)?.verdict ===
    "insufficient"
  );
}

function firstShortConnection(
  items: readonly MeetingItem[],
  busy: Busy,
  ctx: FitContext,
  maxWalk: number,
): FitLabel | null {
  for (const x of items) {
    if (!isStop(x, ctx.campus)) continue;
    const planStops = busy.stopsByDay.get(x.day);
    if (!planStops) continue;
    let dayStops: Stop[] | null = null;
    for (const c of planStops) {
      // A walk can only be too long when the gap is shorter than the longest walk.
      const gapAfter = x.start - c.end;
      const gapBefore = c.start - x.end;
      const nearAfter = gapAfter >= 0 && gapAfter < maxWalk;
      const nearBefore = gapBefore >= 0 && gapBefore < maxWalk;
      if (!nearAfter && !nearBefore) continue;
      dayStops ??= [
        ...planStops,
        ...items.filter((i) => i.day === x.day && isStop(i, ctx.campus)),
      ];
      const courseCode = c.source.courseCode;
      if (nearAfter && isConsecutive(c, x, dayStops) && isShort(c, x, ctx))
        return { kind: "not-enough-time", direction: "after", courseCode };
      if (nearBefore && isConsecutive(x, c, dayStops) && isShort(x, c, ctx))
        return { kind: "not-enough-time", direction: "before", courseCode };
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
  return evaluateShape(
    ctx,
    shapeOf(course, section),
    ctx.busyExcept(course.code),
  );
}

function evaluateShape(
  ctx: FitContext,
  shape: SectionShape,
  busy: Busy,
): FitLabel {
  const { items, sparse } = shape;
  if (items.length === 0) return NO_SET_TIMES;
  if (sparseIntersects(sparse, busy.mask)) {
    const other = firstOverlap(items, busy);
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
  if (ctx.maxWalk !== null) {
    const short = firstShortConnection(items, busy, ctx, ctx.maxWalk);
    if (short) return short;
  }
  return FITS;
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
  let fits = ctx.memo.sectionFits.get(section);
  if (fits === undefined) {
    fits = isFitting(evaluateFit(ctx, course, section));
    ctx.memo.sectionFits.set(section, fits);
  }
  return fits;
}

function isFitting(label: FitLabel): boolean {
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
  let fits = ctx.memo.courseFits.get(course);
  if (fits === undefined) {
    const busy = ctx.busyExcept(course.code);
    fits = courseShapes(course).some((shape) =>
      isFitting(evaluateShape(ctx, shape, busy)),
    );
    ctx.memo.courseFits.set(course, fits);
  }
  return fits;
}
