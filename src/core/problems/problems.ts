import { snapshotOf } from "../catalog/catalog-index";
import {
  type CourseCode,
  type Plan,
  type Problem,
  type ProblemFix,
  SEVERITY_ORDER,
  type Section,
  type SectionKey,
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
  // A section you've registered for is yours: a fix never switches it away.
  const registered = new Set(input.plan.registered ?? []);
  const isRegistered = (courseCode: CourseCode) => {
    const code = placedCode(courseCode);
    return code !== null && registered.has(sectionKey(courseCode, code));
  };

  return detected.map(
    ({ signature, switchable, presetFix, ...problem }): Problem => {
      let fix: ProblemFix | null = presetFix;
      if (fix === null) {
        let best: Candidate | null = null;
        for (const courseCode of switchable) {
          if (isRegistered(courseCode)) continue;
          const current = placedCode(courseCode);
          const course = input.index.courses.get(courseCode);
          for (const alt of course?.sections ?? []) {
            if (alt.code === current) continue;
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

/**
 * A full section someone watches is taken care of (the owner's "auto
 * resolution"): its problem becomes a note, "Watching for a seat in
 * CMSC351 0101", which keeps the watch as its fix so it can be stopped
 * from there. The same array back when nothing changes.
 */
export function withWatches(
  problems: readonly Problem[],
  watched: ReadonlySet<SectionKey>,
): readonly Problem[] {
  if (watched.size === 0) return problems;
  let changed = false;
  const out = problems.map((p): Problem => {
    const key = p.fix?.kind === "watch" ? p.fix.sectionKey : null;
    if (p.kind !== "full" || key === null || !watched.has(key)) return p;
    changed = true;
    return {
      ...p,
      id: `watching:${key}`,
      kind: "watching",
      severity: "info",
      title: [
        { kind: "text", text: "Watching for a seat in " },
        { kind: "section", sectionKey: key },
      ],
      detail: [
        { kind: "text", text: "It's full. " },
        ...p.detail,
        { kind: "text", text: " We'll let you know when a seat opens." },
      ],
    };
  });
  return changed ? sortProblems(out) : problems;
}

export function countBySeverity(
  problems: readonly Problem[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const p of problems) counts[p.severity]++;
  return counts;
}

export { problemCountWords } from "./count-words";
