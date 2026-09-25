import { snapshotOf } from "../catalog/catalog-index";
import {
  type CourseCode,
  type Plan,
  type Problem,
  type ProblemFix,
  SEVERITY_ORDER,
  type Section,
  type Severity,
  sectionKey,
} from "../schema";
import { type Detected, detectProblems, type ProblemsInput } from "./detect";

// SPEC §3.6: the plan's problems, most severe first, each with a one-click
// fix when one exists.

/** Errors, then warnings, then info; stable within a severity. */
export function sortProblems<T extends { severity: Severity }>(
  problems: readonly T[],
): T[] {
  return problems
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.p.severity) -
          SEVERITY_ORDER.indexOf(b.p.severity) || a.i - b.i,
    )
    .map(({ p }) => p);
}

/** The plan with one course switched to `section`, with a fresh snapshot. */
export function planWithSection(
  plan: Plan,
  courseCode: CourseCode,
  section: Section,
): Plan {
  return {
    ...plan,
    courses: plan.courses.map((c) =>
      c.courseCode === courseCode
        ? {
            courseCode,
            sectionCode: section.code,
            snapshot: snapshotOf(section),
          }
        : c,
    ),
  };
}

type Candidate = {
  course: CourseCode;
  section: Section;
  signatures: Set<string>;
};

/**
 * For each problem, the best switch that resolves it without creating any
 * problem the plan doesn't already have: fewest problems afterwards, then
 * the most direct course, then section order.
 */
function attachFixes(
  input: ProblemsInput,
  detected: readonly Detected[],
): Problem[] {
  const before = new Set(detected.map((d) => d.signature));
  const tried = new Map<string, Candidate | null>();

  const tryCandidate = (
    courseCode: CourseCode,
    section: Section,
  ): Candidate | null => {
    const key = sectionKey(courseCode, section.code);
    if (tried.has(key)) return tried.get(key) ?? null;
    const after = detectProblems({
      ...input,
      plan: planWithSection(input.plan, courseCode, section),
    });
    const signatures = new Set(after.map((d) => d.signature));
    const createsNothing = [...signatures].every((s) => before.has(s));
    const result = createsNothing
      ? { course: courseCode, section, signatures }
      : null;
    tried.set(key, result);
    return result;
  };

  const placedCode = (courseCode: CourseCode) =>
    input.plan.courses.find((c) => c.courseCode === courseCode)?.sectionCode ??
    null;

  return detected.map(
    ({ signature, switchable, presetFix, ...problem }): Problem => {
      let fix: ProblemFix | null = presetFix;
      if (fix === null) {
        let best: Candidate | null = null;
        for (const courseCode of switchable) {
          const current = placedCode(courseCode);
          const course = input.index.courses.get(courseCode);
          for (const alt of course?.sections ?? []) {
            if (alt.code === current || alt.cancelled) continue;
            const c = tryCandidate(courseCode, alt);
            if (!c || c.signatures.has(signature)) continue;
            if (best === null || c.signatures.size < best.signatures.size)
              best = c;
          }
        }
        if (best) {
          const own = switchable.length <= 1;
          fix = {
            kind: "switch",
            sectionKey: sectionKey(best.course, best.section.code),
            label: own
              ? `Switch to ${best.section.code}`
              : `Switch ${best.course} to ${best.section.code}`,
          };
        }
      }
      return { ...problem, fix };
    },
  );
}

/** Every problem in the plan (SPEC §3.6), sorted by severity, with fixes. */
export function planProblems(input: ProblemsInput): Problem[] {
  return sortProblems(attachFixes(input, detectProblems(input)));
}

export function countBySeverity(
  problems: readonly Problem[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const p of problems) counts[p.severity]++;
  return counts;
}
