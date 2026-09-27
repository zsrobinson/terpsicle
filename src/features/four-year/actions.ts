import { track } from "~/app/analytics";
import { wildcardLabel } from "~/core/catalog/wildcard";
import { fourYearTermLabel } from "~/core/four-year/terms";
import { choicesForWildcard } from "~/core/four-year/wildcards";
import type {
  CourseCode,
  CourseIndexEntry,
  GenEdCode,
  LocalId,
  TermId,
  Wildcard,
} from "~/core/schema";
import {
  type FourYearDoc,
  type FourYearEntry,
  type FourYearProblem,
  type FourYearTerm,
  WILDCARD_CREDITS,
} from "~/core/schema/four-year";
import { courseIndexEntry, useCourseIndex } from "~/state/course-index-store";
import { newLocalId, nowIso } from "~/state/ids";
import { activeDoc, useFourYear } from "./store";

// Plan's actions as people name them: each one dispatches to the core
// reducer with an id and the time, says what happened for the undo toast,
// and counts itself for analytics (never with a course code, V3 §6).

const dispatch = (
  ...args: Parameters<ReturnType<typeof useFourYear.getState>["dispatch"]>
) => useFourYear.getState().dispatch(...args);

/** What a block is called in a toast: its code, or the placeholder's pattern. */
export function entryName(entry: FourYearEntry): string {
  if (entry.kind === "course") return entry.code;
  if (entry.kind === "wildcard")
    return entry.wildcard.kind === "pattern"
      ? entry.wildcard.pattern
      : wildcardLabel(entry.wildcard);
  return entry.title;
}

export function createDoc(firstTermId: TermId): void {
  if (
    dispatch({ type: "create", id: newLocalId(), firstTermId, now: nowIso() })
  )
    track("four_year_created", { source: "empty" });
}

export function duplicateDoc(doc: FourYearDoc): void {
  if (
    dispatch(
      { type: "duplicate", docId: doc.id, id: newLocalId(), now: nowIso() },
      `Made a copy of ${doc.name}`,
    )
  )
    track("four_year_created", { source: "copy" });
}

export function newDoc(firstTermId: TermId): void {
  if (
    dispatch(
      { type: "create", id: newLocalId(), firstTermId, now: nowIso() },
      "Started a new four-year plan",
    )
  )
    track("four_year_created", { source: "empty" });
}

export function deleteDoc(doc: FourYearDoc): void {
  dispatch({ type: "delete", docId: doc.id }, `Deleted ${doc.name}`);
}

export function renameDoc(doc: FourYearDoc, name: string): void {
  dispatch(
    { type: "rename", docId: doc.id, name, now: nowIso() },
    `Renamed to ${name.trim()}`,
  );
}

export function setFirstTerm(doc: FourYearDoc, firstTermId: TermId): void {
  dispatch(
    { type: "set-first-term", docId: doc.id, firstTermId, now: nowIso() },
    `Starts in ${fourYearTermLabel(firstTermId)} now`,
  );
}

export function addCourse(
  doc: FourYearDoc,
  code: string,
  term: FourYearTerm,
  via: "search" | "column",
): void {
  const entry: FourYearEntry = {
    kind: "course",
    id: newLocalId(),
    term,
    code,
    credits: null,
    genEdChoices: {},
    source: "typed",
    transcript: null,
  };
  if (
    dispatch(
      { type: "add", docId: doc.id, entry, now: nowIso() },
      `Added ${code} to ${fourYearTermLabel(term)}`,
    )
  )
    track("four_year_course_added", { via });
}

export function addPlaceholder(
  doc: FourYearDoc,
  wildcard: Wildcard,
  term: FourYearTerm,
): void {
  const entry: FourYearEntry = {
    kind: "wildcard",
    id: newLocalId(),
    term,
    wildcard,
    credits: WILDCARD_CREDITS.default,
    source: "typed",
  };
  if (
    dispatch(
      { type: "add", docId: doc.id, entry, now: nowIso() },
      `Added ${entryName(entry)} to ${fourYearTermLabel(term)}`,
    )
  )
    track("four_year_wildcard_added", { kind: wildcard.kind });
}

/**
 * "Pick" in Search: loads the course's department first, so a GenEd
 * placeholder's choice comes from the catalog's groups, not the search row.
 */
export async function pickForPlaceholder(
  entryId: LocalId,
  code: CourseCode,
): Promise<void> {
  await useCourseIndex.getState().ensureDepts([code.slice(0, 4)]);
  const doc = activeDoc(useFourYear.getState());
  if (!doc) return;
  const course = courseIndexEntry(useCourseIndex.getState(), code);
  resolvePlaceholder(doc, entryId, course ?? { code, genEds: [] });
}

export function resolvePlaceholder(
  doc: FourYearDoc,
  entryId: LocalId,
  course: Pick<CourseIndexEntry, "code" | "genEds">,
): void {
  const entry = doc.entries.find((e) => e.id === entryId);
  if (entry?.kind !== "wildcard") return;
  if (
    dispatch(
      {
        type: "resolve-wildcard",
        docId: doc.id,
        entryId,
        code: course.code,
        credits: null,
        genEdChoices: choicesForWildcard(entry.wildcard, course),
        now: nowIso(),
      },
      `Picked ${course.code} for ${entryName(entry)}`,
    )
  ) {
    track("four_year_wildcard_resolved", { kind: entry.wildcard.kind });
    track("four_year_course_added", { via: "wildcard-resolve" });
  }
}

export function moveEntry(
  doc: FourYearDoc,
  entry: FourYearEntry,
  term: FourYearTerm,
  via: "drag" | "menu",
  index?: number,
): void {
  const moved = dispatch(
    {
      type: "move",
      docId: doc.id,
      entryId: entry.id,
      term,
      ...(index === undefined ? {} : { index }),
      now: nowIso(),
    },
    entry.term === term
      ? `Moved ${entryName(entry)} within ${fourYearTermLabel(term)}`
      : `Moved ${entryName(entry)} to ${fourYearTermLabel(term)}`,
  );
  if (moved) track("four_year_course_moved", { via });
}

export function removeEntry(doc: FourYearDoc, entry: FourYearEntry): void {
  dispatch(
    { type: "remove", docId: doc.id, entryId: entry.id, now: nowIso() },
    `Removed ${entryName(entry)} from ${fourYearTermLabel(entry.term)}`,
  );
}

export function setCredits(
  doc: FourYearDoc,
  entry: FourYearEntry,
  credits: number | null,
): void {
  dispatch(
    {
      type: "set-credits",
      docId: doc.id,
      entryId: entry.id,
      credits,
      now: nowIso(),
    },
    credits === null
      ? `${entryName(entry)} counts Testudo's credits`
      : `${entryName(entry)} counts ${credits} ${credits === 1 ? "credit" : "credits"}`,
  );
}

export function setGenEdChoice(
  doc: FourYearDoc,
  entry: FourYearEntry,
  group: number,
  code: GenEdCode | null,
): void {
  dispatch(
    {
      type: "set-choice",
      docId: doc.id,
      entryId: entry.id,
      group,
      code,
      now: nowIso(),
    },
    code === null
      ? `${entryName(entry)} counts where it helps most`
      : `${entryName(entry)} counts as ${code}`,
  );
}

export function applyFix(doc: FourYearDoc, problem: FourYearProblem): void {
  const fix = problem.fix;
  if (!fix) return;
  // The same step the reducer takes, so undo takes it back in one go.
  const changed =
    fix.kind === "move"
      ? dispatch(
          {
            type: "move",
            docId: doc.id,
            entryId: fix.entryId,
            term: fix.term,
            now: nowIso(),
          },
          fix.label,
        )
      : dispatch(
          {
            type: "remove",
            docId: doc.id,
            entryId: fix.entryId,
            now: nowIso(),
          },
          fix.label,
        );
  if (changed) track("four_year_problem_fix_applied", { kind: problem.kind });
}
