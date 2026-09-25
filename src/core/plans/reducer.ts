import { defaultCourseColor } from "../color/color";
import type {
  Block,
  CourseCode,
  CourseColor,
  IsoDateTime,
  LocalId,
  Plan,
  PlanCourse,
  SectionCode,
  SectionSnapshot,
  TermId,
} from "../schema";
import { cleanPlanName, copyName, nextPlanName } from "./naming";

// The pure reducer behind the plans store. Everything a person can undo goes
// through here: plans, blocks (per term) and course colors (global).
// Ids and times come in on the action, so the reducer stays pure; an action
// that changes nothing returns the same state object, so it isn't pushed on
// the undo stack.

export type PlansState = {
  readonly plans: readonly Plan[];
  readonly blocks: readonly Block[];
  readonly colors: Readonly<Record<CourseCode, CourseColor>>;
};

export const EMPTY_PLANS_STATE: PlansState = {
  plans: [],
  blocks: [],
  colors: {},
};

export type PlacedSection = {
  readonly code: SectionCode;
  readonly snapshot: SectionSnapshot;
};

export type PlanAction =
  /** A new plan at the end of the term's tabs. Name defaults to the next "Plan X". */
  | {
      type: "plan/create";
      id: LocalId;
      termId: TermId;
      now: IsoDateTime;
      name?: string;
      courses?: readonly PlanCourse[];
    }
  /** "Copy of X", in the same term, right after it. */
  | { type: "plan/duplicate"; planId: LocalId; id: LocalId; now: IsoDateTime }
  | { type: "plan/rename"; planId: LocalId; name: string; now: IsoDateTime }
  | { type: "plan/delete"; planId: LocalId }
  /** Moves a plan tab to `toIndex` among its term's plans. */
  | { type: "plan/move"; planId: LocalId; toIndex: number }
  /** Adds a course placed in a section, or saved for later (`section: null`). An existing course is switched instead. */
  | {
      type: "course/add";
      planId: LocalId;
      courseCode: CourseCode;
      section: PlacedSection | null;
      now: IsoDateTime;
    }
  | {
      type: "course/remove";
      planId: LocalId;
      courseCode: CourseCode;
      now: IsoDateTime;
    }
  /** Switches a placed course's section, or places a saved one. */
  | {
      type: "course/switch";
      planId: LocalId;
      courseCode: CourseCode;
      section: PlacedSection;
      now: IsoDateTime;
    }
  | {
      type: "course/save-for-later";
      planId: LocalId;
      courseCode: CourseCode;
      now: IsoDateTime;
    }
  /** Moves a course to `toIndex` in the Courses tab. */
  | {
      type: "course/move";
      planId: LocalId;
      courseCode: CourseCode;
      toIndex: number;
      now: IsoDateTime;
    }
  /** "Keep new times": takes the catalog's current section into the snapshot. */
  | {
      type: "course/accept-change";
      planId: LocalId;
      courseCode: CourseCode;
      snapshot: SectionSnapshot;
      now: IsoDateTime;
    }
  | { type: "color/set"; courseCode: CourseCode; color: CourseColor }
  | { type: "block/add"; block: Block }
  | {
      type: "block/update";
      blockId: LocalId;
      patch: Partial<Pick<Block, "label" | "days" | "start" | "end">>;
    }
  | { type: "block/remove"; blockId: LocalId };

/** A term's plans in tab order. */
export function plansInTerm(state: PlansState, termId: TermId): Plan[] {
  return state.plans
    .filter((p) => p.termId === termId)
    .sort((a, b) => a.order - b.order);
}

export function blocksInTerm(state: PlansState, termId: TermId): Block[] {
  return state.blocks.filter((b) => b.termId === termId);
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  if (item === undefined) return out;
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

function updatePlan(
  state: PlansState,
  planId: LocalId,
  now: IsoDateTime,
  change: (courses: readonly PlanCourse[]) => readonly PlanCourse[],
): PlansState {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return state;
  const courses = change(plan.courses);
  if (courses === plan.courses) return state;
  return {
    ...state,
    plans: state.plans.map((p) =>
      p === plan ? { ...p, courses: [...courses], updatedAt: now } : p,
    ),
  };
}

function withColor(
  state: PlansState,
  planId: LocalId,
  courseCode: CourseCode,
): PlansState {
  if (state.colors[courseCode]) return state;
  const plan = state.plans.find((p) => p.id === planId);
  const used = (plan?.courses ?? []).flatMap((c) => {
    const color =
      c.courseCode === courseCode ? undefined : state.colors[c.courseCode];
    return color ? [color] : [];
  });
  return {
    ...state,
    colors: {
      ...state.colors,
      [courseCode]: defaultCourseColor(courseCode, used),
    },
  };
}

function setSection(
  courses: readonly PlanCourse[],
  courseCode: CourseCode,
  section: PlacedSection | null,
): readonly PlanCourse[] {
  const i = courses.findIndex((c) => c.courseCode === courseCode);
  if (i === -1) return courses;
  const current = courses[i];
  if (section === null && current?.sectionCode === null) return courses;
  const next: PlanCourse = section
    ? { courseCode, sectionCode: section.code, snapshot: section.snapshot }
    : { courseCode, sectionCode: null, snapshot: null };
  return courses.map((c, k) => (k === i ? next : c));
}

function renumber(
  state: PlansState,
  termId: TermId,
  ordered: readonly Plan[],
): PlansState {
  const order = new Map(ordered.map((p, i) => [p.id, i]));
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.termId === termId && order.get(p.id) !== p.order
        ? { ...p, order: order.get(p.id) ?? p.order }
        : p,
    ),
  };
}

export function plansReducer(
  state: PlansState,
  action: PlanAction,
): PlansState {
  switch (action.type) {
    case "plan/create": {
      if (state.plans.some((p) => p.id === action.id)) return state;
      const inTerm = plansInTerm(state, action.termId);
      const name =
        (action.name !== undefined ? cleanPlanName(action.name) : null) ??
        nextPlanName(inTerm.map((p) => p.name));
      const plan: Plan = {
        id: action.id,
        termId: action.termId,
        name,
        order: inTerm.reduce((max, p) => Math.max(max, p.order + 1), 0),
        createdAt: action.now,
        updatedAt: action.now,
        courses: [...(action.courses ?? [])],
      };
      let next: PlansState = { ...state, plans: [...state.plans, plan] };
      for (const c of plan.courses)
        next = withColor(next, plan.id, c.courseCode);
      return next;
    }
    case "plan/duplicate": {
      const source = state.plans.find((p) => p.id === action.planId);
      if (!source || state.plans.some((p) => p.id === action.id)) return state;
      const inTerm = plansInTerm(state, source.termId);
      const copy: Plan = {
        ...source,
        id: action.id,
        name: copyName(
          source.name,
          inTerm.map((p) => p.name),
        ),
        createdAt: action.now,
        updatedAt: action.now,
        courses: source.courses.map((c) => ({ ...c })),
      };
      const ordered = [...inTerm];
      ordered.splice(ordered.indexOf(source) + 1, 0, copy);
      return renumber(
        { ...state, plans: [...state.plans, copy] },
        source.termId,
        ordered,
      );
    }
    case "plan/rename": {
      const name = cleanPlanName(action.name);
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan || name === null || name === plan.name) return state;
      return {
        ...state,
        plans: state.plans.map((p) =>
          p === plan ? { ...p, name, updatedAt: action.now } : p,
        ),
      };
    }
    case "plan/delete": {
      if (!state.plans.some((p) => p.id === action.planId)) return state;
      return {
        ...state,
        plans: state.plans.filter((p) => p.id !== action.planId),
      };
    }
    case "plan/move": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan) return state;
      const inTerm = plansInTerm(state, plan.termId);
      const from = inTerm.indexOf(plan);
      const to = Math.max(0, Math.min(action.toIndex, inTerm.length - 1));
      if (from === to) return state;
      return renumber(state, plan.termId, move(inTerm, from, to));
    }
    case "course/add": {
      const plan = state.plans.find((p) => p.id === action.planId);
      if (!plan) return state;
      if (plan.courses.some((c) => c.courseCode === action.courseCode)) {
        return action.section
          ? plansReducer(state, {
              ...action,
              type: "course/switch",
              section: action.section,
            })
          : state;
      }
      const entry: PlanCourse = action.section
        ? {
            courseCode: action.courseCode,
            sectionCode: action.section.code,
            snapshot: action.section.snapshot,
          }
        : { courseCode: action.courseCode, sectionCode: null, snapshot: null };
      const added = updatePlan(state, action.planId, action.now, (cs) => [
        ...cs,
        entry,
      ]);
      return withColor(added, action.planId, action.courseCode);
    }
    case "course/remove":
      return updatePlan(state, action.planId, action.now, (cs) =>
        cs.some((c) => c.courseCode === action.courseCode)
          ? cs.filter((c) => c.courseCode !== action.courseCode)
          : cs,
      );
    case "course/switch":
      return updatePlan(state, action.planId, action.now, (cs) => {
        const current = cs.find((c) => c.courseCode === action.courseCode);
        if (current?.sectionCode === action.section.code) return cs;
        return setSection(cs, action.courseCode, action.section);
      });
    case "course/save-for-later":
      return updatePlan(state, action.planId, action.now, (cs) =>
        setSection(cs, action.courseCode, null),
      );
    case "course/move":
      return updatePlan(state, action.planId, action.now, (cs) => {
        const from = cs.findIndex((c) => c.courseCode === action.courseCode);
        const to = Math.max(0, Math.min(action.toIndex, cs.length - 1));
        return from === -1 || from === to ? cs : move(cs, from, to);
      });
    case "course/accept-change":
      return updatePlan(state, action.planId, action.now, (cs) => {
        const current = cs.find((c) => c.courseCode === action.courseCode);
        if (!current || current.sectionCode === null) return cs;
        return setSection(cs, action.courseCode, {
          code: current.sectionCode,
          snapshot: action.snapshot,
        });
      });
    case "color/set":
      if (state.colors[action.courseCode] === action.color) return state;
      return {
        ...state,
        colors: { ...state.colors, [action.courseCode]: action.color },
      };
    case "block/add":
      if (state.blocks.some((b) => b.id === action.block.id)) return state;
      return { ...state, blocks: [...state.blocks, action.block] };
    case "block/update": {
      const block = state.blocks.find((b) => b.id === action.blockId);
      if (!block) return state;
      const next: Block = { ...block, ...action.patch };
      if (next.end <= next.start || next.days.length === 0) return state;
      const same =
        next.label === block.label &&
        next.start === block.start &&
        next.end === block.end &&
        next.days.join() === block.days.join();
      if (same) return state;
      return {
        ...state,
        blocks: state.blocks.map((b) => (b === block ? next : b)),
      };
    }
    case "block/remove":
      if (!state.blocks.some((b) => b.id === action.blockId)) return state;
      return {
        ...state,
        blocks: state.blocks.filter((b) => b.id !== action.blockId),
      };
  }
}
