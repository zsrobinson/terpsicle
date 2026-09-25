import type { CatalogIndex } from "../catalog/catalog-index";
import {
  type CourseCode,
  type Day,
  type GeneratedPlan,
  type GenerateRequest,
  type GenerateResult,
  type Relaxation,
  sectionKey,
} from "../schema";
import type { SeatsMap } from "../seats/seats";
import { formatTime, sortDays } from "../time/format";
import type { CampusMap } from "../travel/campus";
import {
  candidateGroups,
  type QualityMap,
  type SectionGroup,
} from "./candidates";
import { relaxCourseItem } from "./draft";
import { mergeSameWeek } from "./merge";
import { nearMisses } from "./near-miss";
import { planStats } from "./score";
import { orderVars, type SolveProgress, type SolveVar, solve } from "./solve";

// The generator (SPEC §3.9): the person's courses and must-haves in, ranked
// plans out; and when nothing fits, what to loosen and the closest misses.
// Pure: the worker calls it with the catalog it holds.

export type GenerateData = {
  readonly index: CatalogIndex;
  readonly seats: SeatsMap | null;
  readonly campus: CampusMap;
  /** Ratings and GPAs per section (see `sectionQuality`); empty is fine. */
  readonly quality: QualityMap;
};

export type GenerateOptions = {
  readonly onProgress?: (progress: SolveProgress) => void;
  readonly shouldCancel?: () => boolean;
};

type Built = {
  vars: SolveVar[];
  picks: { count: number }[];
  /** Request position of each course, so results list courses as the person did. */
  order: Map<CourseCode, number>;
};

/** The request's items as search variables, one per course (first mention wins). */
function buildVars(
  request: GenerateRequest,
  data: GenerateData,
  keepViolations: boolean,
): Built {
  const vars: SolveVar[] = [];
  const picks: { count: number }[] = [];
  const order = new Map<CourseCode, number>();
  const blocks = request.mustHaves.respectBlocks ? request.blocks : [];
  const add = (
    courseCode: CourseCode,
    only: readonly string[] | undefined,
    role: SolveVar["role"],
  ) => {
    if (order.has(courseCode)) return;
    order.set(courseCode, order.size);
    const course = data.index.courses.get(courseCode) ?? null;
    vars.push({
      courseCode,
      role,
      credits: course ? course.credits : null,
      groups: course
        ? candidateGroups(course, {
            mustHaves: request.mustHaves,
            blocks,
            seats: data.seats,
            quality: data.quality,
            only: only ?? null,
            keepViolations,
          })
        : [],
    });
  };
  for (const item of request.items) {
    if (item.kind === "course") {
      add(item.courseCode, item.sections, {
        kind: item.required ? "required" : "optional",
      });
    } else {
      const group = picks.length;
      const before = vars.length;
      for (const c of item.courses)
        add(c.courseCode, c.sections, { kind: "pick", group });
      // A course already listed elsewhere doesn't count twice toward the group.
      picks.push({ count: Math.min(item.count, vars.length - before) });
    }
  }
  return { vars: orderVars(vars), picks, order };
}

function toPlan(
  vars: readonly SolveVar[],
  choices: readonly (SectionGroup | null)[],
  order: ReadonlyMap<CourseCode, number>,
  score: number,
  breakdown: GeneratedPlan["breakdown"],
): GeneratedPlan {
  const chosen = choices
    .filter((g): g is SectionGroup => g !== null)
    .sort(
      (a, b) =>
        (order.get(a.course.code) ?? 0) - (order.get(b.course.code) ?? 0),
    );
  const sections = chosen.map((g) =>
    // biome-ignore lint/style/noNonNullAssertion: every group has a first section
    sectionKey(g.course.code, g.sections[0]!.code),
  );
  const merged = chosen.filter((g) => g.sections.length > 1);
  return {
    id: [...sections].sort().join(","),
    sections,
    skipped: vars
      .flatMap((v, i) => (choices[i] ? [] : [v.courseCode]))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    score,
    breakdown,
    stats: planStats(chosen),
    equivalents: {
      count: merged.reduce((n, g) => n * g.sections.length, 1),
      byCourse: merged.map((g) => ({
        courseCode: g.course.code,
        sectionCodes: g.sections.map((s) => s.code),
      })),
    },
  };
}

const DAY_PLURALS: Record<Day, string> = {
  M: "Mondays",
  Tu: "Tuesdays",
  W: "Wednesdays",
  Th: "Thursdays",
  F: "Fridays",
  Sa: "Saturdays",
  Su: "Sundays",
};

/** Every constraint that could be loosened, as a patch and its label. */
export function relaxationOptions(
  request: GenerateRequest,
): Omit<Relaxation, "unlockCount" | "atLeast">[] {
  const m = request.mustHaves;
  const out: Omit<Relaxation, "unlockCount" | "atLeast">[] = [];
  if (m.earliestStart !== null)
    out.push({
      constraint: "earliest-start",
      label: `Allow classes before ${formatTime(m.earliestStart)}`,
      patch: { mustHaves: { earliestStart: null } },
    });
  if (m.latestEnd !== null)
    out.push({
      constraint: "latest-end",
      label: `Allow classes after ${formatTime(m.latestEnd)}`,
      patch: { mustHaves: { latestEnd: null } },
    });
  if (m.daysOff.length > 0)
    out.push({
      constraint: "days-off",
      label: `Allow classes on ${sortDays(m.daysOff)
        .map((d) => DAY_PLURALS[d])
        .join(" and ")}`,
      patch: { mustHaves: { daysOff: [] } },
    });
  if (m.enoughTravelTime)
    out.push({
      constraint: "enough-travel-time",
      label: "Allow classes without time to walk between them",
      patch: { mustHaves: { enoughTravelTime: false } },
    });
  if (m.openSeatsOnly)
    out.push({
      constraint: "open-seats-only",
      label: "Include full sections",
      patch: { mustHaves: { openSeatsOnly: false } },
    });
  if (m.respectBlocks && request.blocks.length > 0)
    out.push({
      constraint: "respect-blocks",
      label: "Ignore my blocks",
      patch: { mustHaves: { respectBlocks: false } },
    });
  if (m.credits.min !== null || m.credits.max !== null)
    out.push({
      constraint: "credits",
      label: "Any number of credits",
      patch: { mustHaves: { credits: { min: null, max: null } } },
    });
  for (const item of request.items) {
    if (item.kind !== "course") continue;
    if (item.required)
      out.push({
        constraint: "required-course",
        label: `Make ${item.courseCode} optional`,
        patch: { makeOptional: item.courseCode },
      });
    if (item.sections)
      out.push({
        constraint: "section-restriction",
        label: `Allow any section of ${item.courseCode}`,
        patch: { allowAllSections: item.courseCode },
      });
  }
  return out;
}

/** The request with a relaxation's patch applied (what clicking it does). */
export function applyRelaxation(
  request: GenerateRequest,
  patch: Relaxation["patch"],
): GenerateRequest {
  return {
    ...request,
    mustHaves: { ...request.mustHaves, ...(patch.mustHaves ?? {}) },
    items: request.items.map((item) =>
      item.kind === "course" ? relaxCourseItem(item, patch) : item,
    ),
  };
}

function run(
  request: GenerateRequest,
  data: GenerateData,
  limits: { maxResults: number; maxSteps: number },
  options: GenerateOptions = {},
) {
  const built = buildVars(request, data, false);
  const outcome = solve({
    vars: built.vars,
    picks: built.picks,
    credits: request.mustHaves.credits,
    travel: request.mustHaves.enoughTravelTime ? request.travel : null,
    campus: data.campus,
    rankBy: request.rankBy,
    maxResults: limits.maxResults,
    maxSteps: limits.maxSteps,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.shouldCancel ? { shouldCancel: options.shouldCancel } : {}),
  });
  return { built, outcome };
}

/** Plans kept per "pick 1" course the best results left out. */
const PER_MISSING_PICK = 20;

/**
 * The best plans for each course of a "pick 1 of these" group that none of
 * the kept results picked. The top 200 can all take the same course when it
 * fits best, and the person still wants to compare the others: that's why
 * they listed them.
 */
function missingPicks(
  request: GenerateRequest,
  data: GenerateData,
  found: readonly GeneratedPlan[],
  options: GenerateOptions,
): { plans: GeneratedPlan[]; steps: number } {
  const placed = new Set(found.flatMap((p) => p.sections.map(courseOf)));
  const plans: GeneratedPlan[] = [];
  let steps = 0;
  request.items.forEach((item, i) => {
    if (item.kind !== "pick" || item.count !== 1) return;
    for (const course of item.courses) {
      if (placed.has(course.courseCode) || options.shouldCancel?.()) continue;
      // The same request with the group's other courses given no sections,
      // so each result still lists them as left out.
      const only: GenerateRequest = {
        ...request,
        items: request.items.map((other, j) =>
          j !== i || other.kind !== "pick"
            ? other
            : {
                ...other,
                courses: other.courses.map((c) =>
                  c.courseCode === course.courseCode
                    ? c
                    : { ...c, sections: [] },
                ),
              },
        ),
      };
      const { built, outcome } = run(only, data, {
        maxResults: PER_MISSING_PICK,
        maxSteps: Math.max(1, Math.floor(request.limits.maxSteps / 5)),
      });
      steps += outcome.steps;
      for (const s of outcome.solutions)
        plans.push(
          toPlan(built.vars, s.choices, built.order, s.score, s.breakdown),
        );
    }
  });
  return { plans, steps };
}

const courseOf = (key: string): CourseCode => key.split("-")[0] ?? key;

/** Runs the generator: ranked plans, or relaxations and near-misses when nothing fits. */
export function generatePlans(
  request: GenerateRequest,
  data: GenerateData,
  options: GenerateOptions = {},
): GenerateResult {
  const { built, outcome } = run(request, data, request.limits, options);
  const found = outcome.solutions.map((s) =>
    toPlan(built.vars, s.choices, built.order, s.score, s.breakdown),
  );
  if (found.length > 0 || outcome.cancelled) {
    const extra = outcome.cancelled
      ? { plans: [], steps: 0 }
      : missingPicks(request, data, found, options);
    const seen = new Set(found.map((p) => p.id));
    const all = [...found, ...extra.plans.filter((p) => !seen.has(p.id))];
    // Stable, so equal scores keep the search's order.
    all.sort((a, b) => b.score - a.score);
    return {
      results: mergeSameWeek(all, data.index),
      totalFound: outcome.found,
      truncated: outcome.truncated,
      capped: outcome.found > outcome.solutions.length,
      steps: outcome.steps + extra.steps,
      relaxations: [],
      nearMisses: [],
    };
  }

  // Nothing fits. A smaller budget for each what-if keeps this quick.
  const whatIfSteps = Math.max(1, Math.floor(request.limits.maxSteps / 5));
  const relaxations: Relaxation[] = [];
  for (const option of relaxationOptions(request)) {
    if (options.shouldCancel?.()) break;
    const relaxed = applyRelaxation(request, option.patch);
    const { outcome: what } = run(relaxed, data, {
      maxResults: 1,
      maxSteps: whatIfSteps,
    });
    if (what.found > 0)
      relaxations.push({
        ...option,
        unlockCount: what.found,
        atLeast: what.truncated,
      });
  }
  relaxations.sort((a, b) => b.unlockCount - a.unlockCount);

  const wide = buildVars(request, data, true);
  const misses = nearMisses({
    vars: wide.vars,
    picks: wide.picks,
    mustHaves: request.mustHaves,
    travel: request.mustHaves.enoughTravelTime ? request.travel : null,
    campus: data.campus,
    keep: 3,
    maxConflicts: 3,
    maxSteps: Math.max(1, Math.floor(request.limits.maxSteps / 5)),
  });
  return {
    results: [],
    totalFound: 0,
    truncated: outcome.truncated,
    capped: false,
    steps: outcome.steps,
    relaxations,
    nearMisses: misses,
  };
}
