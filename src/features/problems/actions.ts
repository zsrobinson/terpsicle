import { openTab } from "~/app/actions";
import { track } from "~/app/analytics";
import { snapshotOf } from "~/core/catalog";
import {
  type Problem,
  type ProblemFix,
  parseSectionKey,
  type Subject,
} from "~/core/schema";
import { editablePlan, openCourse } from "~/features/courses/actions";
import { useCatalog } from "~/state/catalog-store";
import { nowIso } from "~/state/ids";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";

// Problems (SPEC §3.6): opening what a problem is about, and its one-click fix.

/** Opens a subject: a course's details, a connection's details, or Blocks. */
export function openSubject(subject: Subject): void {
  switch (subject.kind) {
    case "course":
      openCourse(subject.courseCode);
      return;
    case "section": {
      const parsed = parseSectionKey(subject.sectionKey);
      if (parsed) openCourse(parsed.courseCode);
      return;
    }
    case "connection":
      useUi
        .getState()
        .drill({ kind: "connection", connectionId: subject.connectionId });
      return;
    case "block":
      openTab("blocks", "click");
      return;
  }
}

/** Clicking a problem opens its first subject (DATA.md §9). */
export function openProblem(problem: Problem): void {
  const subject = problem.subjects[0];
  if (!subject) return;
  openSubject(subject);
  track("problem_opened", { kind: problem.kind });
}

/**
 * Applies a problem's fix as one undoable change. Returns false when it no
 * longer applies (the plan or catalog moved on since it was offered).
 */
export function applyFix(problem: Problem, fix: ProblemFix): boolean {
  const plan = editablePlan();
  const parsed = parseSectionKey(fix.sectionKey);
  if (!plan || !parsed) return false;
  const ref = useCatalog
    .getState()
    .byTerm[plan.termId]?.index.sections.get(fix.sectionKey);
  if (!ref) return false;
  const { courseCode, sectionCode } = parsed;
  const now = nowIso();
  const before = useWorkspace.getState().plans;
  if (fix.kind === "switch") {
    useWorkspace.getState().dispatch(
      {
        type: "course/switch",
        planId: plan.id,
        courseCode,
        section: { code: sectionCode, snapshot: snapshotOf(ref.section) },
        now,
      },
      `Switched ${courseCode} to ${sectionCode}`,
    );
  } else {
    useWorkspace.getState().dispatch(
      {
        type: "course/accept-change",
        planId: plan.id,
        courseCode,
        snapshot: snapshotOf(ref.section),
        now,
      },
      `Kept the new times for ${courseCode} ${sectionCode}`,
    );
  }
  if (useWorkspace.getState().plans === before) return false;
  track("problem_fix_applied", { kind: fix.kind, problem: problem.kind });
  return true;
}
